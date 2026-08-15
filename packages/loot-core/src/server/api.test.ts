import * as db from '#server/db';
import * as sheet from '#server/sheet';
import { getBankSyncError } from '#shared/errors';
import type { ServerHandlers } from '#types/server-handlers';

import { installAPI } from './api';
import { setBudget, setGroupBudget } from './budget/actions';
import { createBudget } from './budget/base';
import { getHeldCategoryId } from './budget/held-category';
import * as prefs from './prefs';

vi.mock('#shared/errors', () => ({
  getBankSyncError: vi.fn(error => `Bank sync error: ${error}`),
}));

describe('API handlers', () => {
  const handlers = installAPI({} as unknown as ServerHandlers);

  describe('api/get-server-version', () => {
    beforeEach(() => {
      prefs.unloadPrefs();
    });

    it('does not require an open budget', async () => {
      handlers['get-server-version'] = vi
        .fn()
        .mockResolvedValue({ version: '26.6.0' });

      await expect(handlers['api/get-server-version']()).resolves.toEqual({
        version: '26.6.0',
      });
    });
  });

  describe('api/bank-sync', () => {
    it('should sync a single account when accountId is provided', async () => {
      handlers['accounts-bank-sync'] = vi
        .fn()
        .mockResolvedValue({ errors: [] });

      await handlers['api/bank-sync']({ accountId: 'account1' });
      expect(handlers['accounts-bank-sync']).toHaveBeenCalledWith({
        ids: ['account1'],
      });
    });

    it('should handle errors in non batch sync', async () => {
      handlers['accounts-bank-sync'] = vi.fn().mockResolvedValue({
        errors: ['connection-failed'],
      });

      await expect(
        handlers['api/bank-sync']({ accountId: 'account2' }),
      ).rejects.toThrow('Bank sync error: connection-failed');

      expect(getBankSyncError).toHaveBeenCalledWith('connection-failed');
    });
  });

  describe('api/budget-month', () => {
    beforeEach(global.emptyDatabase());

    beforeEach(async () => {
      global.currentMonth = '2026-01';

      await sheet.loadSpreadsheet(db);
      await prefs.loadPrefs();

      await db.insertCategoryGroup({
        id: 'income-group',
        name: 'Income',
        is_income: 1,
      });
      await db.insertCategory({
        id: 'income-cat',
        name: 'Salary',
        cat_group: 'income-group',
        is_income: 1,
      });

      await db.insertAccount({ id: 'acct1', name: 'Checking' });

      handlers['get-budget-bounds'] = vi
        .fn()
        .mockResolvedValue({ start: '2026-01', end: '2026-12' });
    });

    afterEach(() => {
      global.currentMonth = null;
    });

    it('envelope budget: income group returns only received', async () => {
      await createBudget(['2026-02', '2026-03']);
      await db.insertTransaction({
        id: 'tx1',
        date: '2026-03-15',
        account: 'acct1',
        amount: 5000,
        category: 'income-cat',
      });
      await sheet.waitOnSpreadsheet();

      const result = await handlers['api/budget-month']({ month: '2026-03' });
      const group = result.categoryGroups.find(g => g.is_income);
      assert(group, 'Expected income category group to exist');

      expect(group).toHaveProperty('received', 5000);
      expect(group).not.toHaveProperty('budgeted');
      expect(group).not.toHaveProperty('balance');
      expect(group?.categories?.[0]).toHaveProperty('received', 5000);
      expect(group?.categories?.[0]).not.toHaveProperty('budgeted');
      expect(group?.categories?.[0]).not.toHaveProperty('balance');
    });

    it('tracking budget: income group returns budgeted, received, and balance', async () => {
      sheet.get().meta().budgetType = 'tracking';
      await db.update('preferences', { id: 'budgetType', value: 'tracking' });

      await createBudget(['2026-02', '2026-03']);
      sheet.get().set('budget202603!budget-income-cat', 6000);
      await db.insertTransaction({
        id: 'tx1',
        date: '2026-03-15',
        account: 'acct1',
        amount: 5000,
        category: 'income-cat',
      });
      await sheet.waitOnSpreadsheet();

      const result = await handlers['api/budget-month']({ month: '2026-03' });
      const group = result.categoryGroups.find(g => g.is_income);
      assert(group, 'Expected income category group to exist');

      expect(group).toHaveProperty('budgeted', 6000);
      expect(group).toHaveProperty('received', 5000);
      expect(group).toHaveProperty('balance', 1000);
      expect(group?.categories?.[0]).toHaveProperty('budgeted', 6000);
      expect(group?.categories?.[0]).toHaveProperty('received', 5000);
      expect(group?.categories?.[0]).toHaveProperty('balance', 1000);
      expect(group?.categories?.[0]).toHaveProperty('carryover', false);
    });

    describe('group budgeting', () => {
      beforeEach(async () => {
        await db.insertCategoryGroup({
          id: 'expense-group',
          name: 'Usual Expenses',
          is_income: 0,
        });
        await db.insertCategory({
          id: 'groceries',
          name: 'Groceries',
          cat_group: 'expense-group',
          is_income: 0,
        });
      });

      async function getExpenseGroup() {
        const result = await handlers['api/budget-month']({ month: '2026-03' });
        const group = result.categoryGroups.find(g => g.id === 'expense-group');
        assert(group, 'Expected expense category group to exist');
        return group;
      }

      it('reports the undistributed part of a group total as toDistribute', async () => {
        await createBudget(['2026-02', '2026-03']);
        await setBudget({
          category: 'groceries',
          month: '2026-03',
          amount: 20000,
        });
        await setGroupBudget({
          group: 'expense-group',
          month: '2026-03',
          amount: 30000,
        });
        await sheet.waitOnSpreadsheet();

        expect(await getExpenseGroup()).toHaveProperty('toDistribute', 10000);
      });

      it('hides the Held Category from the group categories', async () => {
        await createBudget(['2026-02', '2026-03']);
        await setGroupBudget({
          group: 'expense-group',
          month: '2026-03',
          amount: 30000,
        });
        await sheet.waitOnSpreadsheet();

        const heldCategoryId = await getHeldCategoryId('expense-group');
        expect(heldCategoryId).not.toBeNull();

        const group = await getExpenseGroup();
        expect(group.categories?.map(category => category.id)).toEqual([
          'groceries',
        ]);
      });

      it('keeps the Held Category hidden once the group total is fully distributed', async () => {
        await createBudget(['2026-02', '2026-03']);
        await setGroupBudget({
          group: 'expense-group',
          month: '2026-03',
          amount: 20000,
        });
        await setBudget({
          category: 'groceries',
          month: '2026-03',
          amount: 20000,
        });
        await setGroupBudget({
          group: 'expense-group',
          month: '2026-03',
          amount: 20000,
        });
        await sheet.waitOnSpreadsheet();

        const group = await getExpenseGroup();
        expect(group).toHaveProperty('toDistribute', 0);
        expect(group.categories?.map(category => category.id)).toEqual([
          'groceries',
        ]);
      });

      it('group budgeted equals toDistribute plus the listed child budgets', async () => {
        await createBudget(['2026-02', '2026-03']);
        await setBudget({
          category: 'groceries',
          month: '2026-03',
          amount: 20000,
        });
        await setGroupBudget({
          group: 'expense-group',
          month: '2026-03',
          amount: 30000,
        });
        await sheet.waitOnSpreadsheet();

        const group = await getExpenseGroup();
        const childBudgeted = (group.categories ?? []).reduce(
          (total, category) => total + Number(category.budgeted),
          0,
        );

        expect(group.budgeted).toBe(Number(group.toDistribute) + childBudgeted);
      });

      it('reports toDistribute of 0 for a group that was never funded', async () => {
        await createBudget(['2026-02', '2026-03']);
        await setBudget({
          category: 'groceries',
          month: '2026-03',
          amount: 20000,
        });
        await sheet.waitOnSpreadsheet();

        const group = await getExpenseGroup();
        expect(group).toHaveProperty('toDistribute', 0);
        expect(group).toHaveProperty('budgeted', 20000);
        expect(group.categories?.map(category => category.id)).toEqual([
          'groceries',
        ]);
      });

      it('does not report toDistribute for an income group', async () => {
        await createBudget(['2026-02', '2026-03']);
        await sheet.waitOnSpreadsheet();

        const result = await handlers['api/budget-month']({ month: '2026-03' });
        const group = result.categoryGroups.find(g => g.is_income);
        assert(group, 'Expected income category group to exist');

        expect(group).not.toHaveProperty('toDistribute');
      });
    });
  });
});
