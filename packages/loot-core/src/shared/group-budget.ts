import type { CategoryGroupEntity } from '#types/models';
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
