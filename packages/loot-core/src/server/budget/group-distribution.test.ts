import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import * as db from '#server/db';
import * as sheet from '#server/sheet';

import { getSheetValue, setBudget, setGroupBudget } from './actions';
import * as budget from './base';
import {
  coverAllOverspendingFromGroup,
  coverFromGroup,
  distributeFromGroup,
} from './group-distribution';
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
  await db.insertCategory({
    id: 'cat2',
    name: 'cat2',
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

async function spend(category: string, amount: number) {
  await db.insertTransaction({
    date: '2024-01-15',
    amount: -amount,
    account: 'account1',
    category,
  });
  await sheet.waitOnSpreadsheet();
}

async function getMonthNotes(month: string): Promise<string | null> {
  const row = await db.first<Pick<db.DbNote, 'note'>>(
    'SELECT note FROM notes WHERE id = ?',
    [`budget-${month}`],
  );
  return row?.note ?? null;
}

describe('distributeFromGroup', () => {
  beforeEach(global.emptyDatabase());
  afterEach(global.emptyDatabase());

  it('moves money from To Distribute into the chosen category', async () => {
    await setupDatabase();
    await setGroupBudget({ group: 'group1', month: '2024-01', amount: 30000 });
    await sheet.waitOnSpreadsheet();

    const heldCategoryId = (await getHeldCategoryId('group1'))!;

    await distributeFromGroup({
      month: '2024-01',
      group: 'group1',
      category: 'cat1',
      amount: 12000,
      currencyCode: 'USD',
    });
    await sheet.waitOnSpreadsheet();

    expect(
      await getSheetValue('budget202401', `budget-${heldCategoryId}`),
    ).toBe(18000);
    expect(await getSheetValue('budget202401', 'budget-cat1')).toBe(12000);
  });

  it('leaves Group Budgeted and To Budget unchanged', async () => {
    await setupDatabase();
    await setGroupBudget({ group: 'group1', month: '2024-01', amount: 30000 });
    await sheet.waitOnSpreadsheet();

    const groupBudgetedBefore = await getSheetValue(
      'budget202401',
      'group-budget-group1',
    );
    const toBudgetBefore = await getSheetValue('budget202401', 'to-budget');

    await distributeFromGroup({
      month: '2024-01',
      group: 'group1',
      category: 'cat1',
      amount: 12000,
      currencyCode: 'USD',
    });
    await sheet.waitOnSpreadsheet();

    expect(await getSheetValue('budget202401', 'group-budget-group1')).toBe(
      groupBudgetedBefore,
    );
    expect(await getSheetValue('budget202401', 'to-budget')).toBe(
      toBudgetBefore,
    );
  });

  it('adds to an existing category budget instead of replacing it', async () => {
    await setupDatabase();
    await setBudget({ category: 'cat1', month: '2024-01', amount: 5000 });
    await setGroupBudget({ group: 'group1', month: '2024-01', amount: 30000 });
    await sheet.waitOnSpreadsheet();

    await distributeFromGroup({
      month: '2024-01',
      group: 'group1',
      category: 'cat1',
      amount: 10000,
      currencyCode: 'USD',
    });
    await sheet.waitOnSpreadsheet();

    expect(await getSheetValue('budget202401', 'budget-cat1')).toBe(15000);
  });

  it('records a reassignment note', async () => {
    await setupDatabase();
    await setGroupBudget({ group: 'group1', month: '2024-01', amount: 30000 });
    await sheet.waitOnSpreadsheet();

    await distributeFromGroup({
      month: '2024-01',
      group: 'group1',
      category: 'cat1',
      amount: 12000,
      currencyCode: 'USD',
    });
    await sheet.waitOnSpreadsheet();

    expect(await getMonthNotes('2024-01')).toMatch(
      /Reassigned 120\.00 from To Distribute → cat1/,
    );
  });

  it('may drive To Distribute negative', async () => {
    await setupDatabase();

    await distributeFromGroup({
      month: '2024-01',
      group: 'group1',
      category: 'cat1',
      amount: 12000,
      currencyCode: 'USD',
    });
    await sheet.waitOnSpreadsheet();

    const heldCategoryId = (await getHeldCategoryId('group1'))!;
    expect(
      await getSheetValue('budget202401', `budget-${heldCategoryId}`),
    ).toBe(-12000);
  });

  it('refuses a category outside the group', async () => {
    await setupDatabase();

    await expect(
      distributeFromGroup({
        month: '2024-01',
        group: 'group1',
        category: 'other-cat',
        amount: 12000,
        currencyCode: 'USD',
      }),
    ).rejects.toThrow(/group1/);
  });

  it('refuses to distribute to the Held Category itself', async () => {
    await setupDatabase();
    await setGroupBudget({ group: 'group1', month: '2024-01', amount: 30000 });
    const heldCategoryId = (await getHeldCategoryId('group1'))!;

    await expect(
      distributeFromGroup({
        month: '2024-01',
        group: 'group1',
        category: heldCategoryId,
        amount: 12000,
        currencyCode: 'USD',
      }),
    ).rejects.toThrow(/itself/);
  });
});

describe('coverFromGroup', () => {
  beforeEach(global.emptyDatabase());
  afterEach(global.emptyDatabase());

  it('brings an overspent category balance to exactly zero', async () => {
    await setupDatabase();
    await setGroupBudget({ group: 'group1', month: '2024-01', amount: 30000 });
    await spend('cat1', 4500);

    await coverFromGroup({
      month: '2024-01',
      category: 'cat1',
      currencyCode: 'USD',
    });
    await sheet.waitOnSpreadsheet();

    expect(await getSheetValue('budget202401', 'leftover-cat1')).toBe(0);

    const heldCategoryId = (await getHeldCategoryId('group1'))!;
    expect(
      await getSheetValue('budget202401', `budget-${heldCategoryId}`),
    ).toBe(25500);
  });

  it('leaves Group Budgeted and To Budget unchanged', async () => {
    await setupDatabase();
    await setGroupBudget({ group: 'group1', month: '2024-01', amount: 30000 });
    await spend('cat1', 4500);

    const groupBudgetedBefore = await getSheetValue(
      'budget202401',
      'group-budget-group1',
    );
    const toBudgetBefore = await getSheetValue('budget202401', 'to-budget');

    await coverFromGroup({
      month: '2024-01',
      category: 'cat1',
      currencyCode: 'USD',
    });
    await sheet.waitOnSpreadsheet();

    expect(await getSheetValue('budget202401', 'group-budget-group1')).toBe(
      groupBudgetedBefore,
    );
    expect(await getSheetValue('budget202401', 'to-budget')).toBe(
      toBudgetBefore,
    );
  });

  it('covers in full even when To Distribute cannot afford it', async () => {
    await setupDatabase();
    await setGroupBudget({ group: 'group1', month: '2024-01', amount: 1000 });
    await spend('cat1', 4500);

    await coverFromGroup({
      month: '2024-01',
      category: 'cat1',
      currencyCode: 'USD',
    });
    await sheet.waitOnSpreadsheet();

    expect(await getSheetValue('budget202401', 'leftover-cat1')).toBe(0);

    const heldCategoryId = (await getHeldCategoryId('group1'))!;
    expect(
      await getSheetValue('budget202401', `budget-${heldCategoryId}`),
    ).toBe(-3500);
  });

  it('does nothing for a category that is not overspent', async () => {
    await setupDatabase();
    await setGroupBudget({ group: 'group1', month: '2024-01', amount: 30000 });
    await setBudget({ category: 'cat1', month: '2024-01', amount: 5000 });
    await sheet.waitOnSpreadsheet();

    const heldCategoryId = (await getHeldCategoryId('group1'))!;

    await coverFromGroup({
      month: '2024-01',
      category: 'cat1',
      currencyCode: 'USD',
    });
    await sheet.waitOnSpreadsheet();

    expect(await getSheetValue('budget202401', 'budget-cat1')).toBe(5000);
    expect(
      await getSheetValue('budget202401', `budget-${heldCategoryId}`),
    ).toBe(30000);
    expect(await getMonthNotes('2024-01')).toBeNull();
  });

  it('records a reassignment note', async () => {
    await setupDatabase();
    await setGroupBudget({ group: 'group1', month: '2024-01', amount: 30000 });
    await spend('cat1', 4500);

    await coverFromGroup({
      month: '2024-01',
      category: 'cat1',
      currencyCode: 'USD',
    });
    await sheet.waitOnSpreadsheet();

    expect(await getMonthNotes('2024-01')).toMatch(
      /Reassigned 45\.00 from To Distribute → cat1/,
    );
  });
});

describe('coverAllOverspendingFromGroup', () => {
  beforeEach(global.emptyDatabase());
  afterEach(global.emptyDatabase());

  it('brings every overspent category in the group to zero', async () => {
    await setupDatabase();
    await setGroupBudget({ group: 'group1', month: '2024-01', amount: 30000 });
    await spend('cat1', 4500);
    await spend('cat2', 2500);

    await coverAllOverspendingFromGroup({
      month: '2024-01',
      group: 'group1',
      currencyCode: 'USD',
    });
    await sheet.waitOnSpreadsheet();

    expect(await getSheetValue('budget202401', 'leftover-cat1')).toBe(0);
    expect(await getSheetValue('budget202401', 'leftover-cat2')).toBe(0);

    const heldCategoryId = (await getHeldCategoryId('group1'))!;
    expect(
      await getSheetValue('budget202401', `budget-${heldCategoryId}`),
    ).toBe(23000);
  });

  it('leaves Group Budgeted and To Budget unchanged', async () => {
    await setupDatabase();
    await setGroupBudget({ group: 'group1', month: '2024-01', amount: 30000 });
    await spend('cat1', 4500);
    await spend('cat2', 2500);

    const groupBudgetedBefore = await getSheetValue(
      'budget202401',
      'group-budget-group1',
    );
    const toBudgetBefore = await getSheetValue('budget202401', 'to-budget');

    await coverAllOverspendingFromGroup({
      month: '2024-01',
      group: 'group1',
      currencyCode: 'USD',
    });
    await sheet.waitOnSpreadsheet();

    expect(await getSheetValue('budget202401', 'group-budget-group1')).toBe(
      groupBudgetedBefore,
    );
    expect(await getSheetValue('budget202401', 'to-budget')).toBe(
      toBudgetBefore,
    );
  });

  it('drives To Distribute negative rather than covering only part', async () => {
    await setupDatabase();
    await spend('cat1', 4500);
    await spend('cat2', 2500);

    await coverAllOverspendingFromGroup({
      month: '2024-01',
      group: 'group1',
      currencyCode: 'USD',
    });
    await sheet.waitOnSpreadsheet();

    expect(await getSheetValue('budget202401', 'leftover-cat1')).toBe(0);
    expect(await getSheetValue('budget202401', 'leftover-cat2')).toBe(0);

    const heldCategoryId = (await getHeldCategoryId('group1'))!;
    expect(
      await getSheetValue('budget202401', `budget-${heldCategoryId}`),
    ).toBe(-7000);
  });

  it('leaves categories that are not overspent alone', async () => {
    await setupDatabase();
    await setGroupBudget({ group: 'group1', month: '2024-01', amount: 30000 });
    await setBudget({ category: 'cat2', month: '2024-01', amount: 5000 });
    await spend('cat1', 4500);

    await coverAllOverspendingFromGroup({
      month: '2024-01',
      group: 'group1',
      currencyCode: 'USD',
    });
    await sheet.waitOnSpreadsheet();

    expect(await getSheetValue('budget202401', 'budget-cat2')).toBe(5000);
  });

  it('leaves overspending in other groups alone', async () => {
    await setupDatabase();
    await spend('cat1', 4500);
    await spend('other-cat', 3000);

    await coverAllOverspendingFromGroup({
      month: '2024-01',
      group: 'group1',
      currencyCode: 'USD',
    });
    await sheet.waitOnSpreadsheet();

    expect(await getSheetValue('budget202401', 'leftover-cat1')).toBe(0);
    expect(await getSheetValue('budget202401', 'leftover-other-cat')).toBe(
      -3000,
    );
  });

  it('records one reassignment note per covered category', async () => {
    await setupDatabase();
    await setGroupBudget({ group: 'group1', month: '2024-01', amount: 30000 });
    await spend('cat1', 4500);
    await spend('cat2', 2500);

    await coverAllOverspendingFromGroup({
      month: '2024-01',
      group: 'group1',
      currencyCode: 'USD',
    });
    await sheet.waitOnSpreadsheet();

    const notes = await getMonthNotes('2024-01');
    expect(notes).toMatch(/Reassigned 45\.00 from To Distribute → cat1/);
    expect(notes).toMatch(/Reassigned 25\.00 from To Distribute → cat2/);
  });

  it('does nothing when the group has no overspending', async () => {
    await setupDatabase();
    await setGroupBudget({ group: 'group1', month: '2024-01', amount: 30000 });
    await sheet.waitOnSpreadsheet();

    const heldCategoryId = (await getHeldCategoryId('group1'))!;

    await coverAllOverspendingFromGroup({
      month: '2024-01',
      group: 'group1',
      currencyCode: 'USD',
    });
    await sheet.waitOnSpreadsheet();

    expect(
      await getSheetValue('budget202401', `budget-${heldCategoryId}`),
    ).toBe(30000);
    expect(await getMonthNotes('2024-01')).toBeNull();
  });
});
