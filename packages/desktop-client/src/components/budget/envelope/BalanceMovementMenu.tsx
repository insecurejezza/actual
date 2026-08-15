import React, { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { heldCategoryPrefKey } from '@actual-app/core/shared/group-budget';

import { useCategory } from '#hooks/useCategory';
import { useFeatureFlag } from '#hooks/useFeatureFlag';
import { useFormat } from '#hooks/useFormat';
import { useSyncedPref } from '#hooks/useSyncedPref';
import { useUndo } from '#hooks/useUndo';
import { envelopeBudget } from '#spreadsheet/bindings';

import { BalanceMenu } from './BalanceMenu';
import { CoverMenu } from './CoverMenu';
import { useEnvelopeSheetValue } from './EnvelopeBudgetComponents';
import { TransferMenu } from './TransferMenu';

type BalanceMovementMenuProps = {
  categoryId: string;
  month: string;
  onBudgetAction: (month: string, action: string, arg?: unknown) => void;
  onClose: () => void;
};

export function BalanceMovementMenu({
  categoryId,
  month,
  onBudgetAction,
  onClose,
}: BalanceMovementMenuProps) {
  const { t } = useTranslation();
  const format = useFormat();
  const { showUndoNotification } = useUndo();

  const catBalance =
    useEnvelopeSheetValue(envelopeBudget.catBalance(categoryId)) ?? 0;

  const isGroupBudgetingEnabled = useFeatureFlag('groupBudgeting');
  const { data: category } = useCategory(categoryId);
  const [heldCategoryId] = useSyncedPref(
    heldCategoryPrefKey(category?.group ?? ''),
  );
  // Covering from the group only makes sense once the group holds money of its
  // own, which is exactly when it has a Held Category.
  const canCoverFromGroup = Boolean(isGroupBudgetingEnabled && heldCategoryId);

  const [menu, _setMenu] = useState('menu');

  const ref = useRef<HTMLSpanElement>(null);
  // Keep focus inside the popover on menu change
  const setMenu = useCallback(
    (menu: string) => {
      ref.current?.focus();
      _setMenu(menu);
    },
    [ref],
  );

  return (
    <span tabIndex={-1} ref={ref}>
      {menu === 'menu' && (
        <BalanceMenu
          categoryId={categoryId}
          onCarryover={carryover => {
            onBudgetAction(month, 'carryover', {
              category: categoryId,
              flag: carryover,
            });
            onClose();
          }}
          onTransfer={() => setMenu('transfer')}
          onCover={() => setMenu('cover')}
          onCoverFromGroup={
            canCoverFromGroup
              ? () => {
                  onBudgetAction(month, 'cover-from-group', {
                    category: categoryId,
                    currencyCode: format.currency.code,
                  });
                  showUndoNotification({
                    message: t('Covered overspending from the group.'),
                  });
                  onClose();
                }
              : undefined
          }
        />
      )}

      {menu === 'transfer' && (
        <TransferMenu
          categoryId={categoryId}
          initialAmount={catBalance}
          showToBeBudgeted
          onClose={onClose}
          onSubmit={(amount, toCategoryId) => {
            onBudgetAction(month, 'transfer-category', {
              amount,
              from: categoryId,
              to: toCategoryId,
              currencyCode: format.currency.code,
            });
          }}
        />
      )}

      {menu === 'cover' && (
        <CoverMenu
          categoryId={categoryId}
          initialAmount={catBalance}
          onClose={onClose}
          onSubmit={(amount, fromCategoryId) => {
            onBudgetAction(month, 'cover-overspending', {
              to: categoryId,
              from: fromCategoryId,
              amount,
              currencyCode: format.currency.code,
            });
          }}
        />
      )}
    </span>
  );
}
