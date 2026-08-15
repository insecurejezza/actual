import type { IntegerAmount } from '#shared/util';
import type { CategoryEntity, CategoryGroupEntity } from '#types/models';

import { transferCategory } from './actions';
import { ensureHeldCategory } from './held-category';

type GroupTransferArgs = {
  month: string;
  amount: IntegerAmount;
  currencyCode: string;
};

/**
 * Shift an amount of To Distribute from one group to another.
 *
 * Neutral by construction: both ends are Held Categories, so the money stays
 * budgeted and To Budget does not move — only the two groups' Budgeted totals
 * change, by the same amount in opposite directions. The receiving group's
 * Held Category is created on first use, so a group that has never been funded
 * can still be shifted into. Not clamped: shifting more than the sending group
 * holds leaves its To Distribute negative, exactly as T1's group Budgeted cell
 * does.
 *
 * Returns both Held Categories, which the caller needs to read the two
 * To Distribute amounts back out.
 */
export async function transferBetweenGroups({
  month,
  fromGroup,
  toGroup,
  amount,
  currencyCode,
}: GroupTransferArgs & {
  fromGroup: CategoryGroupEntity['id'];
  toGroup: CategoryGroupEntity['id'];
}): Promise<{
  fromHeldCategory: CategoryEntity['id'];
  toHeldCategory: CategoryEntity['id'];
}> {
  if (fromGroup === toGroup) {
    throw new Error('A group budget cannot be transferred to itself.');
  }

  const fromHeldCategory = await ensureHeldCategory(fromGroup);
  const toHeldCategory = await ensureHeldCategory(toGroup);

  if (amount) {
    await transferCategory({
      month,
      amount,
      from: fromHeldCategory,
      to: toHeldCategory,
      currencyCode,
    });
  }

  return { fromHeldCategory, toHeldCategory };
}

/**
 * Release an amount of a group's To Distribute back into the month's
 * To Budget.
 *
 * The one group-budget action that is deliberately *not* neutral: the money
 * stops being budgeted, so the group's Budgeted total falls and To Budget rises
 * by exactly the same amount. Not clamped — returning more than the group holds
 * leaves To Distribute negative.
 *
 * Returns the group's Held Category, which the caller needs to read
 * To Distribute back out.
 */
export async function returnToBudgetFromGroup({
  month,
  group,
  amount,
  currencyCode,
}: GroupTransferArgs & {
  group: CategoryGroupEntity['id'];
}): Promise<CategoryEntity['id']> {
  const heldCategory = await ensureHeldCategory(group);

  if (amount) {
    await transferCategory({
      month,
      amount,
      from: heldCategory,
      to: 'to-budget',
      currencyCode,
    });
  }

  return heldCategory;
}
