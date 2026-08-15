import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import * as db from '#server/db';
import * as sheet from '#server/sheet';
import type { Template } from '#types/models/templates';

import { getSheetValue } from './actions';
import * as budget from './base';
import { applyTemplate, storeTemplates } from './goal-template';
import { ensureHeldCategory } from './held-category';

/**
 * A group automation is an ordinary budget automation living on the group's
 * Held Category, so the only thing that needs proving here is the seam: the
 * bulk template run reaches a Held Category even though it is hidden, and
 * still leaves every other hidden category alone.
 */
async function setupDatabase(income: number) {
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
    id: 'hidden-cat',
    name: 'hidden-cat',
    cat_group: 'group1',
    is_income: 0,
    hidden: 1,
  });

  await sheet.loadSpreadsheet(db);
  await budget.createBudget(['2024-01', '2024-02']);

  await db.insertTransaction({
    date: '2024-01-05',
    amount: income,
    account: 'account1',
    category: 'income-cat',
  });
  await sheet.waitOnSpreadsheet();
}

function monthly(amount: number, priority: number): Template {
  return {
    type: 'periodic',
    amount,
    period: { period: 'month', amount: 1 },
    starting: '2024-01-01',
    directive: 'template',
    priority,
  };
}

async function setTemplate(
  categoryId: string,
  templates: Template[],
): Promise<void> {
  await storeTemplates({
    categoriesWithTemplates: [{ id: categoryId, templates }],
    source: 'ui',
  });
}

describe('group automations', () => {
  beforeEach(global.emptyDatabase());
  afterEach(global.emptyDatabase());

  it('applies a Held Category automation even though the category is hidden', async () => {
    await setupDatabase(100000);
    const heldCategoryId = await ensureHeldCategory('group1');
    await setTemplate(heldCategoryId, [monthly(100, 1)]);

    const result = await applyTemplate({ month: '2024-01' });
    await sheet.waitOnSpreadsheet();

    expect(result.message).toBe('templates-applied');
    expect(
      await getSheetValue('budget202401', `budget-${heldCategoryId}`),
    ).toBe(10000);
    expect(await getSheetValue('budget202401', 'to-budget')).toBe(90000);
  });

  it('leaves an ordinary hidden category out of the run', async () => {
    await setupDatabase(100000);
    await setTemplate('hidden-cat', [monthly(100, 1)]);

    const result = await applyTemplate({ month: '2024-01' });
    await sheet.waitOnSpreadsheet();

    expect(result.message).toBe('templates-up-to-date');
    expect(await getSheetValue('budget202401', 'budget-hidden-cat')).toBe(0);
    expect(await getSheetValue('budget202401', 'to-budget')).toBe(100000);
  });

  it('leaves a hidden group out of the run, Held Category included', async () => {
    await setupDatabase(100000);
    await db.insertCategoryGroup({
      id: 'group2',
      name: 'group2',
      is_income: 0,
      hidden: 1,
    });
    const heldCategoryId = await ensureHeldCategory('group2');
    await setTemplate(heldCategoryId, [monthly(100, 1)]);

    const result = await applyTemplate({ month: '2024-01' });
    await sheet.waitOnSpreadsheet();

    expect(result.message).toBe('templates-up-to-date');
    expect(
      await getSheetValue('budget202401', `budget-${heldCategoryId}`),
    ).toBe(0);
  });

  it('orders a Held Category against ordinary categories by priority', async () => {
    // $150 to go round, $100 wanted at each of two priorities: the group's
    // bucket is first in line, the category behind it takes what is left.
    await setupDatabase(15000);
    const heldCategoryId = await ensureHeldCategory('group1');
    await setTemplate(heldCategoryId, [monthly(100, 1)]);
    await setTemplate('cat1', [monthly(100, 2)]);

    await applyTemplate({ month: '2024-01' });
    await sheet.waitOnSpreadsheet();

    expect(
      await getSheetValue('budget202401', `budget-${heldCategoryId}`),
    ).toBe(10000);
    expect(await getSheetValue('budget202401', 'budget-cat1')).toBe(5000);
    expect(await getSheetValue('budget202401', 'to-budget')).toBe(0);
  });
});
