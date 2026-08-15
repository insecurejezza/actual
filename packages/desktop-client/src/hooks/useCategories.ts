import {
  withoutHeldCategories,
  withoutHeldCategoriesInGroups,
} from '@actual-app/core/shared/group-budget';
import { groupById } from '@actual-app/core/shared/util';
import { useQuery } from '@tanstack/react-query';

import { categoryQueries } from '#budget';

import { useHeldCategoryIds } from './useHeldCategoryIds';

export function useCategories() {
  return useQuery(categoryQueries.list());
}

/**
 * Like {@link useCategories}, minus every group's Held Category.
 *
 * Use this wherever categories are listed for the user — pickers, report
 * selectors, report rows. Reach for {@link useCategories} only where a Held
 * Category still has to resolve, such as looking a category up by id.
 */
export function useVisibleCategories() {
  const heldCategoryIds = useHeldCategoryIds();

  return useQuery({
    ...categoryQueries.list(),
    select: data => ({
      list: withoutHeldCategories(data.list, heldCategoryIds),
      grouped: withoutHeldCategoriesInGroups(data.grouped, heldCategoryIds),
    }),
  });
}

export function useCategoriesById() {
  return useQuery({
    ...categoryQueries.list(),
    select: data => {
      return {
        list: groupById(data.list),
        grouped: groupById(data.grouped),
      };
    },
  });
}
