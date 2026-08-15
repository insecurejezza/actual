import * as db from '#server/db';
import { batchMessages } from '#server/sync';
import * as monthUtils from '#shared/months';
import type { IntegerAmount } from '#shared/util';
import type { CategoryEntity, CategoryGroupEntity } from '#types/models';

import {
  addMovementNotes,
  getSheetValue,
  setBudget,
  transferCategory,
} from './actions';
import { ensureHeldCategory, getHeldCategoryId } from './held-category';

type DistributionArgs = {
  month: string;
  currencyCode: string;
};

/**
 * The group's categories, in display order, without the Held Category — money
 * distributed to the Held Category would just be To Distribute again.
 */
async function getDistributableCategoryIds(
  group: CategoryGroupEntity['id'],
  heldCategory: CategoryEntity['id'] | null,
): Promise<Array<CategoryEntity['id']>> {
  const categories = await db.all<Pick<db.DbCategory, 'id'>>(
    `SELECT id FROM categories
      WHERE cat_group = ? AND tombstone = 0 AND is_income = 0 AND id != ?
      ORDER BY sort_order, id`,
    [group, heldCategory ?? ''],
  );
  return categories.map(({ id }) => id);
}

/**
 * Move an amount out of a group's To Distribute and into one of its
 * categories.
 *
 * Neutral by construction: Group Budgeted and To Budget are both untouched
 * because the money only ever moves between the group's Held Category and a
 * category in the same group. To Distribute is not clamped — distributing more
 * than the group holds leaves it negative, exactly as typing a smaller total
 * into the group's Budgeted cell would.
 *
 * Returns the group's Held Category, which the caller needs to read
 * To Distribute back out.
 */
export async function distributeFromGroup({
  month,
  group,
  category,
  amount,
  currencyCode,
}: DistributionArgs & {
  group: CategoryGroupEntity['id'];
  category: CategoryEntity['id'];
  amount: IntegerAmount;
}): Promise<CategoryEntity['id']> {
  const heldCategory = await ensureHeldCategory(group);

  if (category === heldCategory) {
    throw new Error('A group budget cannot be distributed to itself.');
  }

  const distributable = await getDistributableCategoryIds(group, heldCategory);
  if (!distributable.includes(category)) {
    throw new Error(
      `Category ${category} is not in category group ${group}, so it cannot be distributed to.`,
    );
  }

  if (amount) {
    await transferCategory({
      month,
      amount,
      from: heldCategory,
      to: category,
      currencyCode,
    });
  }

  return heldCategory;
}

/**
 * Top an overspent category's balance up to exactly zero out of its group's
 * To Distribute. Unclamped: the balance always lands on zero, even when that
 * leaves To Distribute negative.
 *
 * Returns the group's Held Category, or null when the category was not
 * overspent and nothing moved.
 */
export async function coverFromGroup({
  month,
  category,
  currencyCode,
}: DistributionArgs & {
  category: CategoryEntity['id'];
}): Promise<CategoryEntity['id'] | null> {
  const row = await db.first<Pick<db.DbCategory, 'cat_group'>>(
    'SELECT cat_group FROM categories WHERE id = ? AND tombstone = 0',
    [category],
  );

  if (!row) {
    throw new Error(`Category ${category} does not exist.`);
  }

  const leftover = await getSheetValue(
    monthUtils.sheetForMonth(month),
    `leftover-${category}`,
  );

  if (leftover >= 0) {
    return null;
  }

  return await distributeFromGroup({
    month,
    group: row.cat_group,
    category,
    amount: -leftover,
    currencyCode,
  });
}

/**
 * Top every overspent category in the group up to zero out of the group's
 * To Distribute, in one undoable action. Unclamped: covering everything can
 * leave To Distribute negative.
 *
 * Returns the group's Held Category, or null when the group had no
 * overspending and nothing moved.
 */
export async function coverAllOverspendingFromGroup({
  month,
  group,
  currencyCode,
}: DistributionArgs & {
  group: CategoryGroupEntity['id'];
}): Promise<CategoryEntity['id'] | null> {
  const sheetName = monthUtils.sheetForMonth(month);
  const categoryIds = await getDistributableCategoryIds(
    group,
    await getHeldCategoryId(group),
  );

  // Every read has to happen before the batch: batched messages are not
  // applied until the batch flushes, so a value read back mid-batch is stale.
  const movements: Array<{ category: CategoryEntity['id']; amount: number }> =
    [];
  for (const category of categoryIds) {
    const leftover = await getSheetValue(sheetName, `leftover-${category}`);
    if (leftover < 0) {
      movements.push({ category, amount: -leftover });
    }
  }

  if (movements.length === 0) {
    return null;
  }

  const heldCategory = await ensureHeldCategory(group);
  const heldBudgeted = await getSheetValue(sheetName, `budget-${heldCategory}`);
  const budgeted = new Map<CategoryEntity['id'], number>();
  for (const { category } of movements) {
    budgeted.set(
      category,
      await getSheetValue(sheetName, `budget-${category}`),
    );
  }

  const covered = movements.reduce((total, { amount }) => total + amount, 0);

  await batchMessages(async () => {
    // The Held Category is written once with the whole total rather than once
    // per category, which would read a stale budget back each time.
    await setBudget({
      category: heldCategory,
      month,
      amount: heldBudgeted - covered,
    });

    for (const { category, amount } of movements) {
      await setBudget({
        category,
        month,
        amount: (budgeted.get(category) ?? 0) + amount,
      });
    }

    await addMovementNotes({
      month,
      movements: movements.map(({ category, amount }) => ({
        amount,
        from: heldCategory,
        to: category,
      })),
      currencyCode,
    });
  });

  return heldCategory;
}
