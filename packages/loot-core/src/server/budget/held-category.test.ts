import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import * as db from '#server/db';
import * as sheet from '#server/sheet';

import * as budget from './base';
import {
  ensureHeldCategory,
  getHeldCategoryId,
  heldCategoryPrefKey,
  isHeldCategory,
} from './held-category';

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

async function readMarker(groupId: string): Promise<string | null> {
  const row = await db.first<Pick<db.DbPreference, 'value'>>(
    'SELECT value FROM preferences WHERE id = ?',
    [heldCategoryPrefKey(groupId)],
  );
  return row?.value ?? null;
}

describe('Held Category', () => {
  beforeEach(global.emptyDatabase());
  afterEach(global.emptyDatabase());

  it('lazily creates a hidden Held Category and records the marker', async () => {
    await setupDatabase();

    expect(await getHeldCategoryId('group1')).toBeNull();

    const heldCategoryId = await ensureHeldCategory('group1');

    const category = await db.first<
      Pick<db.DbCategory, 'id' | 'cat_group' | 'hidden' | 'is_income'>
    >('SELECT id, cat_group, hidden, is_income FROM categories WHERE id = ?', [
      heldCategoryId,
    ]);

    expect(category).toMatchObject({
      cat_group: 'group1',
      hidden: 1,
      is_income: 0,
    });
    expect(await readMarker('group1')).toBe(heldCategoryId);
  });

  it('resolves the same Held Category on subsequent calls', async () => {
    await setupDatabase();

    const first = await ensureHeldCategory('group1');
    const second = await ensureHeldCategory('group1');

    expect(second).toBe(first);
    expect(await getHeldCategoryId('group1')).toBe(first);
  });

  it('identifies Held Categories by the marker, never by name', async () => {
    await setupDatabase();

    const heldCategoryId = await ensureHeldCategory('group1');

    expect(await isHeldCategory(heldCategoryId)).toBe(true);
    expect(await isHeldCategory('cat1')).toBe(false);
  });

  it('does not collide with a user category of the same name', async () => {
    await setupDatabase();
    await db.insertCategory({
      id: 'user-to-distribute',
      name: 'To Distribute',
      cat_group: 'group1',
      is_income: 0,
    });

    const heldCategoryId = await ensureHeldCategory('group1');

    expect(heldCategoryId).not.toBe('user-to-distribute');
    expect(await isHeldCategory('user-to-distribute')).toBe(false);
  });

  it('returns null when the group was deleted', async () => {
    await setupDatabase();
    await ensureHeldCategory('group1');

    await db.deleteCategoryGroup({ id: 'group1' });

    expect(await getHeldCategoryId('group1')).toBeNull();
  });

  it('refuses to create a Held Category for a group that does not exist', async () => {
    await setupDatabase();

    await expect(ensureHeldCategory('nonexistent-group')).rejects.toThrow();
  });

  it('refuses to create a Held Category for the income group', async () => {
    await setupDatabase();

    await expect(ensureHeldCategory('income-group')).rejects.toThrow();
  });

  it('recreates the Held Category when the marked category was deleted', async () => {
    await setupDatabase();
    const original = await ensureHeldCategory('group1');

    await db.deleteCategory({ id: original });

    expect(await getHeldCategoryId('group1')).toBeNull();

    const replacement = await ensureHeldCategory('group1');

    expect(replacement).not.toBe(original);
    expect(await readMarker('group1')).toBe(replacement);
  });

  it('ignores a marker pointing at a category in another group', async () => {
    await setupDatabase();
    await db.insertCategoryGroup({
      id: 'group2',
      name: 'group2',
      is_income: 0,
    });
    await db.update('preferences', {
      id: heldCategoryPrefKey('group2'),
      value: 'cat1',
    });

    expect(await getHeldCategoryId('group2')).toBeNull();
  });
});
