import type { CategoryEntity, CategoryGroupEntity } from '#types/models';
import type { SyncedPrefs } from '#types/prefs';

export const HELD_CATEGORY_PREF_PREFIX = 'group-budget-held-';

/**
 * The synced pref mapping a category group to its Held Category. This marker
 * is the only reliable way to identify a Held Category — never its name.
 */
export function heldCategoryPrefKey(
  groupId: CategoryGroupEntity['id'],
): keyof SyncedPrefs {
  return `${HELD_CATEGORY_PREF_PREFIX}${groupId}`;
}

/**
 * Every Held Category id named by the synced-pref markers.
 *
 * A marker can outlive the category it points at — undoing a group's
 * first-ever funding tombstones the Held Category while the marker stays
 * behind — so ids are taken as written rather than resolved. That is safe for
 * the only thing this set is for: an id that no longer names a category
 * matches nothing and removes nothing.
 */
export function getHeldCategoryIdsFromPrefs(
  prefs: SyncedPrefs,
): Set<CategoryEntity['id']> {
  const heldCategoryIds = new Set<CategoryEntity['id']>();
  for (const [key, value] of Object.entries(prefs)) {
    if (key.startsWith(HELD_CATEGORY_PREF_PREFIX) && value) {
      heldCategoryIds.add(value);
    }
  }
  return heldCategoryIds;
}

/**
 * The categories without any that are a group's Held Category. Returns the
 * list unchanged — same reference — when there is nothing to remove, so
 * callers can keep it in a dependency array.
 */
export function withoutHeldCategories<Category extends CategoryEntity>(
  categories: Category[],
  heldCategoryIds: ReadonlySet<CategoryEntity['id']>,
): Category[] {
  if (!categories.some(category => heldCategoryIds.has(category.id))) {
    return categories;
  }
  return categories.filter(category => !heldCategoryIds.has(category.id));
}

/**
 * The same, for grouped categories. Groups are kept even when their only
 * category was the Held Category, and a group whose categories are untouched
 * keeps its identity.
 */
export function withoutHeldCategoriesInGroups<
  Group extends CategoryGroupEntity,
>(
  groups: Group[],
  heldCategoryIds: ReadonlySet<CategoryEntity['id']>,
): Group[] {
  if (heldCategoryIds.size === 0) {
    return groups;
  }

  let changed = false;
  const filtered = groups.map(group => {
    if (!group.categories) {
      return group;
    }

    const categories = withoutHeldCategories(group.categories, heldCategoryIds);
    if (categories === group.categories) {
      return group;
    }

    changed = true;
    return { ...group, categories };
  });

  return changed ? filtered : groups;
}
