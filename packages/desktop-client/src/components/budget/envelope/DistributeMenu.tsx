import React, { useState } from 'react';
import { Form } from 'react-aria-components';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { InitialFocus } from '@actual-app/components/initial-focus';
import { View } from '@actual-app/components/view';
import type { IntegerAmount } from '@actual-app/core/shared/util';
import type {
  CategoryEntity,
  CategoryGroupEntity,
} from '@actual-app/core/types/models';

import { CategoryAutocomplete } from '#components/autocomplete/CategoryAutocomplete';
import { FinancialInput } from '#components/util/FinancialInput';

type DistributeMenuProps = {
  group: CategoryGroupEntity;
  heldCategoryId?: CategoryEntity['id'] | null;
  onSubmit: (amount: IntegerAmount, categoryId: CategoryEntity['id']) => void;
  onClose: () => void;
};

/**
 * Distribute an amount from a group's To Distribute into one of its
 * categories. Only categories in this group are offered, and never the Held
 * Category itself — money moved there would just be To Distribute again.
 */
export function DistributeMenu({
  group,
  heldCategoryId,
  onSubmit,
  onClose,
}: DistributeMenuProps) {
  const { t } = useTranslation();

  const categoryGroups = [
    {
      ...group,
      categories: (group.categories ?? []).filter(
        category => category.id !== heldCategoryId,
      ),
    },
  ];

  const [amount, setAmount] = useState<IntegerAmount>(0);
  const [toCategoryId, setToCategoryId] = useState<CategoryEntity['id'] | null>(
    null,
  );

  return (
    <Form
      onSubmit={e => {
        e.preventDefault();
        if (amount > 0 && toCategoryId) {
          onSubmit(amount, toCategoryId);
        }
        onClose();
      }}
    >
      <View style={{ padding: 10 }}>
        <View style={{ marginBottom: 5 }}>
          <Trans>Distribute this amount:</Trans>
        </View>
        <View>
          <InitialFocus>
            <FinancialInput value={amount} onUpdate={setAmount} />
          </InitialFocus>
        </View>
        <View style={{ margin: '10px 0 5px 0' }}>
          <Trans>To:</Trans>
        </View>

        <CategoryAutocomplete
          categoryGroups={categoryGroups}
          value={null}
          openOnFocus
          onSelect={(id: string | undefined) => setToCategoryId(id || null)}
          inputProps={{ placeholder: t('(none)') }}
        />

        <View style={{ alignItems: 'flex-end', marginTop: 10 }}>
          <Button
            type="submit"
            variant="primary"
            isDisabled={!toCategoryId || amount <= 0}
            style={{ fontSize: 12, paddingTop: 3, paddingBottom: 3 }}
          >
            <Trans>Distribute</Trans>
          </Button>
        </View>
      </View>
    </Form>
  );
}
