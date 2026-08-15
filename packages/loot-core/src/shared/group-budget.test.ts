import { describe, expect, it } from 'vitest';

import type { CategoryEntity, CategoryGroupEntity } from '#types/models';

import {
  getHeldCategoryIdsFromPrefs,
  heldCategoryPrefKey,
  withoutHeldCategories,
  withoutHeldCategoriesInGroups,
} from './group-budget';

function category(id: CategoryEntity['id'], group: string): CategoryEntity {
  return { id, name: id, group };
}

function group(
  id: CategoryGroupEntity['id'],
  categories: CategoryEntity[],
): CategoryGroupEntity {
  return { id, name: id, categories };
}

describe('getHeldCategoryIdsFromPrefs', () => {
  it('collects the ids named by the markers', () => {
    const ids = getHeldCategoryIdsFromPrefs({
      [heldCategoryPrefKey('group1')]: 'held1',
      [heldCategoryPrefKey('group2')]: 'held2',
      dateFormat: 'yyyy-MM-dd',
    });

    expect(ids).toEqual(new Set(['held1', 'held2']));
  });

  it('is empty when no group has ever been funded', () => {
    expect(getHeldCategoryIdsFromPrefs({ dateFormat: 'yyyy-MM-dd' })).toEqual(
      new Set(),
    );
  });

  it('ignores markers that were cleared', () => {
    const ids = getHeldCategoryIdsFromPrefs({
      [heldCategoryPrefKey('group1')]: '',
      [heldCategoryPrefKey('group2')]: undefined,
      [heldCategoryPrefKey('group3')]: 'held3',
    });

    expect(ids).toEqual(new Set(['held3']));
  });
});

describe('withoutHeldCategories', () => {
  const categories = [
    category('cat1', 'group1'),
    category('held1', 'group1'),
    category('cat2', 'group2'),
  ];

  it('drops the Held Categories', () => {
    expect(withoutHeldCategories(categories, new Set(['held1']))).toEqual([
      category('cat1', 'group1'),
      category('cat2', 'group2'),
    ]);
  });

  it('returns the same list when nothing is held', () => {
    expect(withoutHeldCategories(categories, new Set())).toBe(categories);
  });

  it('leaves the list alone when the marker points at a category that is gone', () => {
    // Undoing a group's first-ever funding tombstones its Held Category while
    // the client's merged marker stays behind. A marker that resolves to
    // nothing simply matches nothing.
    expect(
      withoutHeldCategories(categories, new Set(['tombstoned-held'])),
    ).toEqual(categories);
  });
});

describe('withoutHeldCategoriesInGroups', () => {
  const groups = [
    group('group1', [category('cat1', 'group1'), category('held1', 'group1')]),
    group('group2', [category('cat2', 'group2')]),
  ];

  it('drops the Held Categories from the groups that hold them', () => {
    expect(withoutHeldCategoriesInGroups(groups, new Set(['held1']))).toEqual([
      group('group1', [category('cat1', 'group1')]),
      group('group2', [category('cat2', 'group2')]),
    ]);
  });

  it('keeps every group, even one left with no categories', () => {
    const filtered = withoutHeldCategoriesInGroups(groups, new Set(['cat2']));

    expect(filtered[1]).toEqual(group('group2', []));
  });

  it('returns the same groups when nothing is held', () => {
    expect(withoutHeldCategoriesInGroups(groups, new Set())).toBe(groups);
  });

  it('leaves the groups alone when the marker points at a category that is gone', () => {
    const filtered = withoutHeldCategoriesInGroups(
      groups,
      new Set(['tombstoned-held']),
    );

    expect(filtered).toEqual(groups);
    expect(filtered[0]).toBe(groups[0]);
  });

  it('tolerates a group with no categories loaded', () => {
    expect(
      withoutHeldCategoriesInGroups(
        [{ id: 'group1', name: 'group1' }],
        new Set(['held1']),
      ),
    ).toEqual([{ id: 'group1', name: 'group1' }]);
  });
});
