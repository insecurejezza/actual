import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import * as db from '#server/db';
import * as sheet from '#server/sheet';

import { getSheetValue, setBudget, setGroupBudget } from './actions';
import * as budget from './base';
import { ensureHeldCategory, getHeldCategoryId } from './held-category';

async function setupDatabase() {
  await db.insertCategoryGroup({
    id: 'income-group',
    name: 'Income',
    is_income: 1,
  });
  await db.insertCategory({
    id: 'income-cat',
    name: 'Income',
    cat_group: 'income-group',
    is_income: 1,
  });
  await db.insertCategoryGroup({
    id: 'group1',
    name: 'group1',
    is_income: 0,
  });
  await db.insertCategory({
    id: 'cat1',
    name: 'cat1',
    cat_group: 'group1',
    is_income: 0,
  });
  await sheet.loadSpreadsheet(db);
  await budget.createBudget(['2024-01', '2024-02']);
}

async function getBudgetRow(
  category: string,
  month: number,
): Promise<number | null> {
  const row = await db.first<Pick<db.DbZeroBudget, 'amount'>>(
    'SELECT amount FROM zero_budgets WHERE month = ? AND category = ?',
    [month, category],
  );
  return row?.amount ?? null;
}

describe('setGroupBudget', () => {
  beforeEach(global.emptyDatabase());
  afterEach(global.emptyDatabase());

  it('stores the typed total as the Held Category budget', async () => {
    await setupDatabase();

    await setGroupBudget({ group: 'group1', month: '2024-01', amount: 30000 });
    await sheet.waitOnSpreadsheet();

    const heldCategoryId = await getHeldCategoryId('group1');
    expect(heldCategoryId).not.toBeNull();
    expect(await getBudgetRow(heldCategoryId!, 202401)).toBe(30000);
    expect(await getSheetValue('budget202401', 'group-budget-group1')).toBe(
      30000,
    );
  });

  it('solves To Distribute as the typed total minus child budgets', async () => {
    await setupDatabase();

    await setBudget({ category: 'cat1', month: '2024-01', amount: 20000 });
    await setGroupBudget({ group: 'group1', month: '2024-01', amount: 30000 });
    await sheet.waitOnSpreadsheet();

    const heldCategoryId = (await getHeldCategoryId('group1'))!;
    expect(
      await getSheetValue('budget202401', `budget-${heldCategoryId}`),
    ).toBe(10000);
    expect(await getSheetValue('budget202401', 'group-budget-group1')).toBe(
      30000,
    );
  });

  it('drops To Budget by exactly the newly funded amount', async () => {
    await setupDatabase();
    await sheet.waitOnSpreadsheet();

    const before = await getSheetValue('budget202401', 'to-budget');

    await setGroupBudget({ group: 'group1', month: '2024-01', amount: 30000 });
    await sheet.waitOnSpreadsheet();

    expect(await getSheetValue('budget202401', 'to-budget')).toBe(
      before - 30000,
    );

    // Re-typing the same total is a no-op against To Budget.
    await setGroupBudget({ group: 'group1', month: '2024-01', amount: 30000 });
    await sheet.waitOnSpreadsheet();

    expect(await getSheetValue('budget202401', 'to-budget')).toBe(
      before - 30000,
    );
  });

  it('allows a negative To Distribute without clamping it', async () => {
    await setupDatabase();

    await setBudget({ category: 'cat1', month: '2024-01', amount: 50000 });
    await setGroupBudget({ group: 'group1', month: '2024-01', amount: 30000 });
    await sheet.waitOnSpreadsheet();

    const heldCategoryId = (await getHeldCategoryId('group1'))!;
    expect(
      await getSheetValue('budget202401', `budget-${heldCategoryId}`),
    ).toBe(-20000);
    expect(await getSheetValue('budget202401', 'group-budget-group1')).toBe(
      30000,
    );
  });

  it('rolls a positive To Distribute into the next month', async () => {
    await setupDatabase();

    await setGroupBudget({ group: 'group1', month: '2024-01', amount: 30000 });
    await sheet.waitOnSpreadsheet();

    const heldCategoryId = (await getHeldCategoryId('group1'))!;
    expect(
      await getSheetValue('budget202402', `leftover-${heldCategoryId}`),
    ).toBe(30000);
    expect(await getSheetValue('budget202402', 'last-month-overspent')).toBe(0);
  });

  it('reduces next month To Budget by a negative To Distribute', async () => {
    await setupDatabase();
    await sheet.waitOnSpreadsheet();

    const before = await getSheetValue('budget202402', 'to-budget');

    await setBudget({ category: 'cat1', month: '2024-01', amount: 50000 });
    await setGroupBudget({ group: 'group1', month: '2024-01', amount: 30000 });
    await sheet.waitOnSpreadsheet();

    expect(await getSheetValue('budget202402', 'last-month-overspent')).toBe(
      -20000,
    );
    // 30000 is January's funding, no longer available in February; the extra
    // 20000 is the negative To Distribute, which reduces February's To Budget
    // exactly like an overspent category with carryover off.
    expect(await getSheetValue('budget202402', 'to-budget')).toBe(
      before - 30000 - 20000,
    );
  });

  it('leaves To Distribute untouched when a child category is edited', async () => {
    await setupDatabase();

    await setGroupBudget({ group: 'group1', month: '2024-01', amount: 30000 });
    await sheet.waitOnSpreadsheet();

    const heldCategoryId = (await getHeldCategoryId('group1'))!;
    const toBudgetBefore = await getSheetValue('budget202401', 'to-budget');

    await setBudget({ category: 'cat1', month: '2024-01', amount: 20000 });
    await sheet.waitOnSpreadsheet();

    expect(
      await getSheetValue('budget202401', `budget-${heldCategoryId}`),
    ).toBe(30000);
    expect(await getSheetValue('budget202401', 'group-budget-group1')).toBe(
      50000,
    );
    expect(await getSheetValue('budget202401', 'to-budget')).toBe(
      toBudgetBefore - 20000,
    );
  });

  it('budgets each month independently', async () => {
    await setupDatabase();

    await setGroupBudget({ group: 'group1', month: '2024-01', amount: 30000 });
    await setGroupBudget({ group: 'group1', month: '2024-02', amount: 10000 });
    await sheet.waitOnSpreadsheet();

    const heldCategoryId = (await getHeldCategoryId('group1'))!;
    expect(await getBudgetRow(heldCategoryId, 202401)).toBe(30000);
    expect(await getBudgetRow(heldCategoryId, 202402)).toBe(10000);
  });

  it('reuses an existing Held Category', async () => {
    await setupDatabase();
    const heldCategoryId = await ensureHeldCategory('group1');

    await setGroupBudget({ group: 'group1', month: '2024-01', amount: 30000 });
    await sheet.waitOnSpreadsheet();

    expect(await getHeldCategoryId('group1')).toBe(heldCategoryId);
  });
});
