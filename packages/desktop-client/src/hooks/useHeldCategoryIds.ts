import { useMemo } from 'react';

import { getHeldCategoryIdsFromPrefs } from '@actual-app/core/shared/group-budget';
import type { CategoryEntity } from '@actual-app/core/types/models';

import { useSelector } from '#redux';

import { useFeatureFlag } from './useFeatureFlag';

const NO_HELD_CATEGORIES: ReadonlySet<CategoryEntity['id']> = new Set();

/**
 * The ids of every group's Held Category, so that lists can leave them out.
 *
 * A Held Category is where a group parks its To Distribute; it is budgeting
 * plumbing rather than something the user categorises against, so it never
 * belongs in a list of categories — not even with hidden categories shown.
 *
 * The set is empty unless group budgeting is on, which makes every filter
 * built on it a no-op for everyone else.
 */
export function useHeldCategoryIds(): ReadonlySet<CategoryEntity['id']> {
  const isGroupBudgetingEnabled = useFeatureFlag('groupBudgeting');
  const syncedPrefs = useSelector(state => state.prefs.synced);

  return useMemo(
    () =>
      isGroupBudgetingEnabled
        ? getHeldCategoryIdsFromPrefs(syncedPrefs)
        : NO_HELD_CATEGORIES,
    [isGroupBudgetingEnabled, syncedPrefs],
  );
}
