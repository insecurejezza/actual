import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import * as db from '#server/db';
import { runMutator } from '#server/mutators';
import * as sheet from '#server/sheet';
import { clearUndo, undo, undoable } from '#server/undo';

import { getSheetValue, setBudget, setGroupBudget } from './actions';
import * as budget from './base';
import {
  returnToBudgetFromGroup,
  transferBetweenGroups,
} from './group-transfer';
import { getHeldCategoryId } from './held-category';

async function setupDatabase() {
  await db.insertAccount({ id: 'account1', name: 'Account 1' });
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
  await db.insertCategoryGroup({ id: 'group1', name: 'group1', is_income: 0 });
  await db.insertCategory({
    id: 'cat1',
    name: 'cat1',
    cat_group: 'group1',
    is_income: 0,
  });
  await db.insertCategoryGroup({ id: 'group2', name: 'group2', is_income: 0 });
  await db.insertCategory({
    id: 'other-cat',
    name: 'other-cat',
    cat_group: 'group2',
    is_income: 0,
  });

  await sheet.loadSpreadsheet(db);
  await budget.createBudget(['2024-01', '2024-02']);
  await sheet.waitOnSpreadsheet();
}

async function getMonthNotes(month: string): Promise<string | null> {
  const row = await db.first<Pick<db.DbNote, 'note'>>(
    'SELECT note FROM notes WHERE id = ?',
    [`budget-${month}`],
  );
  return row?.note ?? null;
}

describe('transferBetweenGroups', () => {
  beforeEach(global.emptyDatabase());
  afterEach(global.emptyDatabase());

  it('moves To Distribute from one group to another', async () => {
    await setupDatabase();
    await setGroupBudget({ group: 'group1', month: '2024-01', amount: 30000 });
    await setGroupBudget({ group: 'group2', month: '2024-01', amount: 5000 });
    await sheet.waitOnSpreadsheet();

    const { fromHeldCategory, toHeldCategory } = await transferBetweenGroups({
      month: '2024-01',
      fromGroup: 'group1',
      toGroup: 'group2',
      amount: 12000,
      currencyCode: 'USD',
    });
    await sheet.waitOnSpreadsheet();

    expect(
      await getSheetValue('budget202401', `budget-${fromHeldCategory}`),
    ).toBe(18000);
    expect(
      await getSheetValue('budget202401', `budget-${toHeldCategory}`),
    ).toBe(17000);
  });

  it('leaves To Budget unchanged', async () => {
    await setupDatabase();
    await setGroupBudget({ group: 'group1', month: '2024-01', amount: 30000 });
    await setGroupBudget({ group: 'group2', month: '2024-01', amount: 5000 });
    await sheet.waitOnSpreadsheet();

    const toBudgetBefore = await getSheetValue('budget202401', 'to-budget');

    await transferBetweenGroups({
      month: '2024-01',
      fromGroup: 'group1',
      toGroup: 'group2',
      amount: 12000,
      currencyCode: 'USD',
    });
    await sheet.waitOnSpreadsheet();

    expect(await getSheetValue('budget202401', 'to-budget')).toBe(
      toBudgetBefore,
    );
  });

  it('moves Group Budgeted from one group to the other', async () => {
    await setupDatabase();
    await setGroupBudget({ group: 'group1', month: '2024-01', amount: 30000 });
    await setGroupBudget({ group: 'group2', month: '2024-01', amount: 5000 });
    await sheet.waitOnSpreadsheet();

    await transferBetweenGroups({
      month: '2024-01',
      fromGroup: 'group1',
      toGroup: 'group2',
      amount: 12000,
      currencyCode: 'USD',
    });
    await sheet.waitOnSpreadsheet();

    expect(await getSheetValue('budget202401', 'group-budget-group1')).toBe(
      18000,
    );
    expect(await getSheetValue('budget202401', 'group-budget-group2')).toBe(
      17000,
    );
  });

  it('creates the receiving group Held Category on first use', async () => {
    await setupDatabase();
    await setGroupBudget({ group: 'group1', month: '2024-01', amount: 30000 });
    await sheet.waitOnSpreadsheet();

    expect(await getHeldCategoryId('group2')).toBeNull();

    const { toHeldCategory } = await transferBetweenGroups({
      month: '2024-01',
      fromGroup: 'group1',
      toGroup: 'group2',
      amount: 12000,
      currencyCode: 'USD',
    });
    await sheet.waitOnSpreadsheet();

    expect(await getHeldCategoryId('group2')).toBe(toHeldCategory);
    expect(
      await getSheetValue('budget202401', `budget-${toHeldCategory}`),
    ).toBe(12000);
  });

  it('records a reassignment note', async () => {
    await setupDatabase();
    await setGroupBudget({ group: 'group1', month: '2024-01', amount: 30000 });
    await sheet.waitOnSpreadsheet();

    await transferBetweenGroups({
      month: '2024-01',
      fromGroup: 'group1',
      toGroup: 'group2',
      amount: 12000,
      currencyCode: 'USD',
    });
    await sheet.waitOnSpreadsheet();

    expect(await getMonthNotes('2024-01')).toMatch(/Reassigned 120\.00 from /);
  });

  it('may drive the sending group To Distribute negative', async () => {
    await setupDatabase();

    const { fromHeldCategory } = await transferBetweenGroups({
      month: '2024-01',
      fromGroup: 'group1',
      toGroup: 'group2',
      amount: 12000,
      currencyCode: 'USD',
    });
    await sheet.waitOnSpreadsheet();

    expect(
      await getSheetValue('budget202401', `budget-${fromHeldCategory}`),
    ).toBe(-12000);
  });

  it('refuses to transfer a group budget to itself', async () => {
    await setupDatabase();

    await expect(
      transferBetweenGroups({
        month: '2024-01',
        fromGroup: 'group1',
        toGroup: 'group1',
        amount: 12000,
        currencyCode: 'USD',
      }),
    ).rejects.toThrow(/itself/);
  });

  it('refuses an income group as the destination', async () => {
    await setupDatabase();

    await expect(
      transferBetweenGroups({
        month: '2024-01',
        fromGroup: 'group1',
        toGroup: 'income-group',
        amount: 12000,
        currencyCode: 'USD',
      }),
    ).rejects.toThrow(/Income groups/);
  });
});

describe('returnToBudgetFromGroup', () => {
  beforeEach(global.emptyDatabase());
  afterEach(global.emptyDatabase());

  it('raises To Budget by exactly the returned amount', async () => {
    await setupDatabase();
    await setGroupBudget({ group: 'group1', month: '2024-01', amount: 30000 });
    await sheet.waitOnSpreadsheet();

    const toBudgetBefore = await getSheetValue('budget202401', 'to-budget');

    await returnToBudgetFromGroup({
      month: '2024-01',
      group: 'group1',
      amount: 12000,
      currencyCode: 'USD',
    });
    await sheet.waitOnSpreadsheet();

    expect(await getSheetValue('budget202401', 'to-budget')).toBe(
      toBudgetBefore + 12000,
    );
  });

  it('takes the amount out of To Distribute', async () => {
    await setupDatabase();
    await setGroupBudget({ group: 'group1', month: '2024-01', amount: 30000 });
    await sheet.waitOnSpreadsheet();

    const heldCategory = await returnToBudgetFromGroup({
      month: '2024-01',
      group: 'group1',
      amount: 12000,
      currencyCode: 'USD',
    });
    await sheet.waitOnSpreadsheet();

    expect(await getSheetValue('budget202401', `budget-${heldCategory}`)).toBe(
      18000,
    );
  });

  it('lowers the group Budgeted total', async () => {
    await setupDatabase();
    await setGroupBudget({ group: 'group1', month: '2024-01', amount: 30000 });
    await sheet.waitOnSpreadsheet();

    await returnToBudgetFromGroup({
      month: '2024-01',
      group: 'group1',
      amount: 12000,
      currencyCode: 'USD',
    });
    await sheet.waitOnSpreadsheet();

    expect(await getSheetValue('budget202401', 'group-budget-group1')).toBe(
      18000,
    );
  });

  it('leaves the group category budgets alone', async () => {
    await setupDatabase();
    await setBudget({ category: 'cat1', month: '2024-01', amount: 5000 });
    await setGroupBudget({ group: 'group1', month: '2024-01', amount: 30000 });
    await sheet.waitOnSpreadsheet();

    await returnToBudgetFromGroup({
      month: '2024-01',
      group: 'group1',
      amount: 12000,
      currencyCode: 'USD',
    });
    await sheet.waitOnSpreadsheet();

    expect(await getSheetValue('budget202401', 'budget-cat1')).toBe(5000);
  });

  it('records a reassignment note', async () => {
    await setupDatabase();
    await setGroupBudget({ group: 'group1', month: '2024-01', amount: 30000 });
    await sheet.waitOnSpreadsheet();

    await returnToBudgetFromGroup({
      month: '2024-01',
      group: 'group1',
      amount: 12000,
      currencyCode: 'USD',
    });
    await sheet.waitOnSpreadsheet();

    expect(await getMonthNotes('2024-01')).toMatch(
      /Reassigned 120\.00 from To Distribute → To Budget/,
    );
  });

  it('may drive To Distribute negative', async () => {
    await setupDatabase();

    const heldCategory = await returnToBudgetFromGroup({
      month: '2024-01',
      group: 'group1',
      amount: 12000,
      currencyCode: 'USD',
    });
    await sheet.waitOnSpreadsheet();

    expect(await getSheetValue('budget202401', `budget-${heldCategory}`)).toBe(
      -12000,
    );
  });

  it('refuses an income group', async () => {
    await setupDatabase();

    await expect(
      returnToBudgetFromGroup({
        month: '2024-01',
        group: 'income-group',
        amount: 12000,
        currencyCode: 'USD',
      }),
    ).rejects.toThrow(/Income groups/);
  });
});

describe('undo', () => {
  beforeEach(global.emptyDatabase());
  afterEach(global.emptyDatabase());
  beforeEach(() => clearUndo());

  it('puts a transfer between groups back', async () => {
    await setupDatabase();
    await setGroupBudget({ group: 'group1', month: '2024-01', amount: 30000 });
    await setGroupBudget({ group: 'group2', month: '2024-01', amount: 5000 });
    await sheet.waitOnSpreadsheet();

    const fromHeldCategory = (await getHeldCategoryId('group1'))!;
    const toHeldCategory = (await getHeldCategoryId('group2'))!;

    await runMutator(() =>
      undoable(transferBetweenGroups)({
        month: '2024-01',
        fromGroup: 'group1',
        toGroup: 'group2',
        amount: 12000,
        currencyCode: 'USD',
      }),
    );
    await sheet.waitOnSpreadsheet();

    await runMutator(() => undo());
    await sheet.waitOnSpreadsheet();

    expect(
      await getSheetValue('budget202401', `budget-${fromHeldCategory}`),
    ).toBe(30000);
    expect(
      await getSheetValue('budget202401', `budget-${toHeldCategory}`),
    ).toBe(5000);
    expect(await getMonthNotes('2024-01')).toBeNull();
  });

  it('puts a return to To Budget back', async () => {
    await setupDatabase();
    await setGroupBudget({ group: 'group1', month: '2024-01', amount: 30000 });
    await sheet.waitOnSpreadsheet();

    const heldCategory = (await getHeldCategoryId('group1'))!;
    const toBudgetBefore = await getSheetValue('budget202401', 'to-budget');

    await runMutator(() =>
      undoable(returnToBudgetFromGroup)({
        month: '2024-01',
        group: 'group1',
        amount: 12000,
        currencyCode: 'USD',
      }),
    );
    await sheet.waitOnSpreadsheet();

    await runMutator(() => undo());
    await sheet.waitOnSpreadsheet();

    expect(await getSheetValue('budget202401', `budget-${heldCategory}`)).toBe(
      30000,
    );
    expect(await getSheetValue('budget202401', 'to-budget')).toBe(
      toBudgetBefore,
    );
    expect(await getMonthNotes('2024-01')).toBeNull();
  });
});
