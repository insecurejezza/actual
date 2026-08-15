import React, { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { heldCategoryPrefKey } from '@actual-app/core/shared/group-budget';
import type { CategoryGroupEntity } from '@actual-app/core/types/models';

import { useFormat } from '#hooks/useFormat';
import { useSyncedPref } from '#hooks/useSyncedPref';
import { useUndo } from '#hooks/useUndo';

import { DistributeMenu } from './DistributeMenu';
import { GroupBudgetMenu } from './GroupBudgetMenu';
import { GroupTransferMenu } from './GroupTransferMenu';
import { ReturnToBudgetMenu } from './ReturnToBudgetMenu';

type GroupBudgetMovementMenuProps = {
  group: CategoryGroupEntity;
  month: string;
  onBudgetAction: (month: string, action: string, arg?: unknown) => void;
  onClose: () => void;
};

/**
 * The group Budgeted cell menu: every way money leaves a group's To Distribute.
 * All of them are neutral — Group Budgeted and To Budget stay exactly where
 * they are — except returning to To Budget, which is the one action that
 * deliberately unbudgets the money.
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
          onTransferToGroup={() => setMenu('transfer-to-group')}
          onReturnToBudget={() => setMenu('return-to-budget')}
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

      {menu === 'transfer-to-group' && (
        <GroupTransferMenu
          group={group}
          onClose={onClose}
          onSubmit={(amount, toGroupId) => {
            onBudgetAction(month, 'transfer-between-groups', {
              fromGroup: group.id,
              toGroup: toGroupId,
              amount,
              currencyCode: format.currency.code,
            });
            showUndoNotification({
              message: t('Transferred from {{groupName}}.', {
                groupName: group.name,
              }),
            });
          }}
        />
      )}

      {menu === 'return-to-budget' && (
        <ReturnToBudgetMenu
          onClose={onClose}
          onSubmit={amount => {
            onBudgetAction(month, 'return-to-budget-from-group', {
              group: group.id,
              amount,
              currencyCode: format.currency.code,
            });
            showUndoNotification({
              message: t('Returned to To Budget from {{groupName}}.', {
                groupName: group.name,
              }),
            });
          }}
        />
      )}
    </span>
  );
}
