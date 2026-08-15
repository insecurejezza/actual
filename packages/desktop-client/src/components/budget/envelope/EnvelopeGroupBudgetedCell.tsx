import React, { useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { SvgCheveronDown } from '@actual-app/components/icons/v1';
import { Popover } from '@actual-app/components/popover';
import { styles } from '@actual-app/components/styles';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import { heldCategoryPrefKey } from '@actual-app/core/shared/group-budget';
import type { CategoryGroupEntity } from '@actual-app/core/types/models';

import { SheetCell } from '#components/table';
import { useFormat } from '#hooks/useFormat';
import { useSyncedPref } from '#hooks/useSyncedPref';
import { envelopeBudget } from '#spreadsheet/bindings';

import { GroupBudgetMovementMenu } from './GroupBudgetMovementMenu';
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
 * Its menu moves that To Distribute out to the group's categories.
 */
export function EnvelopeGroupBudgetedCell({
  month,
  group,
  editing,
  onEdit,
  onBudgetAction,
}: EnvelopeGroupBudgetedCellProps) {
  const { t } = useTranslation();
  const format = useFormat();
  const [heldCategoryId] = useSyncedPref(heldCategoryPrefKey(group.id));

  const menuTriggerRef = useRef(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({
    crossOffset: 0,
    offset: 0,
  });

  const handleContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    setMenuPosition({
      crossOffset: e.clientX - rect.left,
      offset: e.clientY - rect.bottom,
    });
    setMenuOpen(true);
  };

  return (
    <View
      ref={menuTriggerRef}
      style={{
        flex: 1,
        flexDirection: 'row',
        '& .hover-visible': {
          opacity: 0,
          transition: 'opacity .25s',
        },
        '&:hover .hover-visible, & .force-visible .hover-visible': {
          opacity: 1,
        },
      }}
      onContextMenu={e => {
        if (editing) return;
        handleContextMenu(e);
      }}
    >
      {!editing && (
        <View
          className={menuOpen ? 'force-visible' : ''}
          style={{ justifyContent: 'center', paddingLeft: 3 }}
        >
          <Button
            variant="bare"
            aria-label={t('Group budget menu for {{groupName}}', {
              groupName: group.name,
            })}
            onPress={() => {
              setMenuPosition({ crossOffset: 2, offset: -4 });
              setMenuOpen(true);
            }}
            style={{ padding: 3 }}
          >
            <SvgCheveronDown width={14} height={14} className="hover-visible" />
          </Button>
        </View>
      )}
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

      <Popover
        triggerRef={menuTriggerRef}
        placement="bottom start"
        isOpen={menuOpen}
        onOpenChange={() => setMenuOpen(false)}
        style={{ width: 250 }}
        isNonModal
        {...menuPosition}
      >
        <GroupBudgetMovementMenu
          group={group}
          month={month}
          onBudgetAction={onBudgetAction}
          onClose={() => setMenuOpen(false)}
        />
      </Popover>
    </View>
  );
}
