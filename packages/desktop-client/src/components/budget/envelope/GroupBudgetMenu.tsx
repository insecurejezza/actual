import React from 'react';
import type { ComponentPropsWithoutRef } from 'react';
import { useTranslation } from 'react-i18next';

import { Menu } from '@actual-app/components/menu';

type GroupBudgetMenuProps = Omit<
  ComponentPropsWithoutRef<typeof Menu>,
  'onMenuSelect' | 'items'
> & {
  onDistribute: () => void;
  onCoverAllOverspending: () => void;
  onTransferToGroup: () => void;
  onReturnToBudget: () => void;
};

/** The actions available on a category group's Budgeted cell. */
export function GroupBudgetMenu({
  onDistribute,
  onCoverAllOverspending,
  onTransferToGroup,
  onReturnToBudget,
  ...props
}: GroupBudgetMenuProps) {
  const { t } = useTranslation();

  return (
    <Menu
      {...props}
      onMenuSelect={name => {
        switch (name) {
          case 'distribute':
            onDistribute();
            break;
          case 'cover-all-overspending':
            onCoverAllOverspending();
            break;
          case 'transfer-to-group':
            onTransferToGroup();
            break;
          case 'return-to-budget':
            onReturnToBudget();
            break;
          default:
            throw new Error(`Unrecognized menu option: ${String(name)}`);
        }
      }}
      items={[
        {
          name: 'distribute',
          text: t('Distribute an amount…'),
        },
        {
          name: 'cover-all-overspending',
          text: t('Cover all overspending in this group'),
        },
        {
          name: 'transfer-to-group',
          text: t('Transfer to another group…'),
        },
        {
          name: 'return-to-budget',
          text: t('Return to To Budget…'),
        },
      ]}
    />
  );
}
