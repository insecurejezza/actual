import * as db from '#server/db';
import {
  HELD_CATEGORY_PREF_PREFIX,
  heldCategoryPrefKey,
} from '#shared/group-budget';
import type { CategoryEntity, CategoryGroupEntity } from '#types/models';

// A Held Category is an ordinary hidden category that stores a group's
// To Distribute amount as its monthly budget. It is identified only by the
// synced-pref marker, never by its name — the user is free to rename it from
// a stock client.
const HELD_CATEGORY_NAME = 'To Distribute';

export { heldCategoryPrefKey };

async function readMarker(
  groupId: CategoryGroupEntity['id'],
): Promise<CategoryEntity['id'] | null> {
  const row = await db.first<Pick<db.DbPreference, 'value'>>(
    'SELECT value FROM preferences WHERE id = ?',
    [heldCategoryPrefKey(groupId)],
  );
  return row?.value || null;
}

/**
 * The group's Held Category, or null when the group has never been funded, or
 * when the marker points at a category that has since been deleted or moved.
 */
export async function getHeldCategoryId(
  groupId: CategoryGroupEntity['id'],
): Promise<CategoryEntity['id'] | null> {
  const categoryId = await readMarker(groupId);
  if (!categoryId) {
    return null;
  }

  const category = await db.first<Pick<db.DbCategory, 'id'>>(
    'SELECT id FROM categories WHERE id = ? AND cat_group = ? AND tombstone = 0',
    [categoryId, groupId],
  );
  return category?.id ?? null;
}

/** Whether the category is the Held Category of some group. */
export async function isHeldCategory(
  categoryId: CategoryEntity['id'],
): Promise<boolean> {
  const row = await db.first<Pick<db.DbPreference, 'id'>>(
    'SELECT id FROM preferences WHERE id LIKE ? AND value = ?',
    [`${HELD_CATEGORY_PREF_PREFIX}%`, categoryId],
  );
  return row != null;
}

type HeldCategoryRow = {
  id: CategoryEntity['id'];
  name: string;
  group_id: CategoryGroupEntity['id'];
  group_name: string;
  marked_group_id: CategoryGroupEntity['id'];
};

/**
 * Every live Held Category, resolved from the markers in one query so that
 * list-wide checks do not turn into one lookup per category.
 *
 * Applies the same rules as {@link getHeldCategoryId} one group at a time: a
 * marker only counts while it points at a category that still exists and still
 * sits in the group that marked it.
 */
async function getHeldCategories(): Promise<HeldCategoryRow[]> {
  const rows = await db.all<HeldCategoryRow>(
    `SELECT c.id AS id, c.name AS name, c.cat_group AS group_id,
            g.name AS group_name,
            SUBSTR(p.id, ?) AS marked_group_id
       FROM preferences p
       JOIN categories c ON c.id = p.value AND c.tombstone = 0
       JOIN category_groups g ON g.id = c.cat_group AND g.tombstone = 0
      WHERE p.id LIKE ?`,
    [HELD_CATEGORY_PREF_PREFIX.length + 1, `${HELD_CATEGORY_PREF_PREFIX}%`],
  );

  return rows.filter(row => row.marked_group_id === row.group_id);
}

/** The ids of every group's Held Category. */
export async function getHeldCategoryIds(): Promise<Set<CategoryEntity['id']>> {
  const rows = await getHeldCategories();
  return new Set(rows.map(({ id }) => id));
}

/**
 * A display label per Held Category, qualified by its group. "To Distribute"
 * on its own is ambiguous the moment two groups' To Distribute appear in the
 * same sentence, as they do in a group-to-group shift's month note.
 */
export async function getHeldCategoryLabels(): Promise<
  Map<CategoryEntity['id'], string>
> {
  const rows = await getHeldCategories();
  return new Map(rows.map(row => [row.id, `${row.name} (${row.group_name})`]));
}

async function findAvailableName(
  groupId: CategoryGroupEntity['id'],
): Promise<string> {
  const categories = await db.all<Pick<db.DbCategory, 'name'>>(
    'SELECT name FROM categories WHERE cat_group = ? AND tombstone = 0',
    [groupId],
  );
  const taken = new Set(
    categories.map(category => category.name.toUpperCase()),
  );

  let name = HELD_CATEGORY_NAME;
  let suffix = 1;
  while (taken.has(name.toUpperCase())) {
    suffix += 1;
    name = `${HELD_CATEGORY_NAME} (${suffix})`;
  }
  return name;
}

/**
 * The group's Held Category, created on first use. Throws when the group no
 * longer exists or cannot hold a budget.
 */
export async function ensureHeldCategory(
  groupId: CategoryGroupEntity['id'],
): Promise<CategoryEntity['id']> {
  const existing = await getHeldCategoryId(groupId);
  if (existing) {
    return existing;
  }

  const group = await db.first<Pick<db.DbCategoryGroup, 'id' | 'is_income'>>(
    'SELECT id, is_income FROM category_groups WHERE id = ? AND tombstone = 0',
    [groupId],
  );

  if (!group) {
    throw new Error(`Category group ${groupId} does not exist.`);
  }
  if (group.is_income) {
    throw new Error('Income groups cannot hold a budget.');
  }

  const categoryId = await db.insertCategory(
    {
      name: await findAvailableName(groupId),
      cat_group: groupId,
      is_income: 0,
      hidden: 1,
    },
    { atEnd: true },
  );

  await db.update('preferences', {
    id: heldCategoryPrefKey(groupId),
    value: categoryId,
  });

  return categoryId;
}
