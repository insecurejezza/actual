import React from 'react';
import { useTranslation } from 'react-i18next';

import { styles } from '@actual-app/components/styles';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import type { CategoryEntity } from '@actual-app/core/types/models';

import { CellValue, CellValueText } from '#components/spreadsheet/CellValue';
import { envelopeBudget } from '#spreadsheet/bindings';

type GroupToDistributeProps = {
  heldCategoryId: CategoryEntity['id'];
};

/**
 * The money budgeted to a category group that has not been distributed to one
 * of its categories yet. Stored as the Held Category's budget.
 */
export function GroupToDistribute({ heldCategoryId }: GroupToDistributeProps) {
  const { t } = useTranslation();

  return (
    <View
      title={t('To Distribute')}
      style={{
        justifyContent: 'center',
        flexShrink: 1,
        paddingLeft: 5,
        overflow: 'hidden',
      }}
    >
      <CellValue<'envelope-budget', 'budget'>
        binding={envelopeBudget.catBudgeted(heldCategoryId)}
        type="financial"
      >
        {props => (
          <CellValueText
            {...props}
            style={{
              fontSize: 11,
              fontWeight: 400,
              color:
                props.value < 0
                  ? theme.budgetNumberNegative
                  : theme.pageTextSubdued,
              ...styles.tnum,
            }}
          />
        )}
      </CellValue>
    </View>
  );
}
