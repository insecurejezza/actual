import React, { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { heldCategoryPrefKey } from '@actual-app/core/shared/group-budget';
import type { CategoryGroupEntity } from '@actual-app/core/types/models';

import { useFormat } from '#hooks/useFormat';
import { useSyncedPref } from '#hooks/useSyncedPref';
import { useUndo } from '#hooks/useUndo';

import { DistributeMenu } from './DistributeMenu';
import { GroupBudgetMenu } from './GroupBudgetMenu';

type GroupBudgetMovementMenuProps = {
  group: CategoryGroupEntity;
  month: string;
  onBudgetAction: (month: string, action: string, arg?: unknown) => void;
  onClose: () => void;
};

/**
 * The group Budgeted cell menu: the ways money leaves a group's To Distribute
 * for one of its categories. Both are neutral — Group Budgeted and To Budget
 * stay exactly where they are.
 */
export function GroupBudgetMovementMenu({
  group,
  month,
  onBudgetAction,
  onClose,
}: GroupBudgetMovementMenuProps) {
  const { t } = useTranslation();
  const format = useFormat();
  const { showUndoNotification } = useUndo();

  const [heldCategoryId] = useSyncedPref(heldCategoryPrefKey(group.id));

  const [menu, _setMenu] = useState('menu');

  const ref = useRef<HTMLSpanElement>(null);
  // Keep focus inside the popover on menu change
  const setMenu = useCallback((menu: string) => {
    ref.current?.focus();
    _setMenu(menu);
  }, []);

  return (
    <span tabIndex={-1} ref={ref}>
      {menu === 'menu' && (
        <GroupBudgetMenu
          onDistribute={() => setMenu('distribute')}
          onCoverAllOverspending={() => {
            onBudgetAction(month, 'cover-all-overspending-from-group', {
              group: group.id,
              currencyCode: format.currency.code,
            });
            showUndoNotification({
              message: t('Covered all overspending in {{groupName}}.', {
                groupName: group.name,
              }),
            });
            onClose();
          }}
        />
      )}

      {menu === 'distribute' && (
        <DistributeMenu
          group={group}
          heldCategoryId={heldCategoryId}
          onClose={onClose}
          onSubmit={(amount, toCategoryId) => {
            onBudgetAction(month, 'distribute-from-group', {
              group: group.id,
              category: toCategoryId,
              amount,
              currencyCode: format.currency.code,
            });
            showUndoNotification({
              message: t('Distributed from {{groupName}}.', {
                groupName: group.name,
              }),
            });
          }}
        />
      )}
    </span>
  );
}
