import React from 'react';

import { styles } from '@actual-app/components/styles';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import { heldCategoryPrefKey } from '@actual-app/core/shared/group-budget';
import type { CategoryGroupEntity } from '@actual-app/core/types/models';

import { SheetCell } from '#components/table';
import { useFormat } from '#hooks/useFormat';
import { useSyncedPref } from '#hooks/useSyncedPref';
import { envelopeBudget } from '#spreadsheet/bindings';

import { GroupToDistribute } from './GroupToDistribute';

type EnvelopeGroupBudgetedCellProps = {
  month: string;
  group: CategoryGroupEntity;
  editing: boolean;
  onEdit: (id: CategoryGroupEntity['id'] | null, month?: string) => void;
  onBudgetAction: (month: string, action: string, arg: unknown) => void;
};

/**
 * The group's Budgeted cell. Typing into it sets Group Budgeted — the whole
 * total, so whatever is left after the category budgets stays as To Distribute.
 */
export function EnvelopeGroupBudgetedCell({
  month,
  group,
  editing,
  onEdit,
  onBudgetAction,
}: EnvelopeGroupBudgetedCellProps) {
  const format = useFormat();
  const [heldCategoryId] = useSyncedPref(heldCategoryPrefKey(group.id));

  return (
    <View style={{ flex: 1, flexDirection: 'row' }}>
      {heldCategoryId && <GroupToDistribute heldCategoryId={heldCategoryId} />}
      <SheetCell<'envelope-budget', 'group-budget'>
        name="budgeted"
        exposed={editing}
        focused={editing}
        width="flex"
        textAlign="right"
        onExpose={() => onEdit(group.id, month)}
        style={{
          fontWeight: 600,
          ...(editing && { zIndex: 100 }),
          ...styles.tnum,
        }}
        valueStyle={{
          cursor: 'default',
          margin: 1,
          padding: '0 4px',
          borderRadius: 4,
          ':hover': {
            boxShadow: 'inset 0 0 0 1px ' + theme.pageTextSubdued,
            backgroundColor: theme.budgetHeaderCurrentMonth,
          },
        }}
        valueProps={{
          binding: envelopeBudget.groupBudgeted(group.id),
          type: 'financial',
          formatExpr: format.forEdit,
          unformatExpr: format.fromEdit,
        }}
        inputProps={{
          onBlur: () => {
            onEdit(null);
          },
          style: {
            backgroundColor: theme.budgetHeaderCurrentMonth,
          },
        }}
        onSave={(parsedIntegerAmount: number | null) => {
          onBudgetAction(month, 'group-budget-amount', {
            group: group.id,
            amount: parsedIntegerAmount ?? 0,
          });
        }}
      />
    </View>
  );
}
