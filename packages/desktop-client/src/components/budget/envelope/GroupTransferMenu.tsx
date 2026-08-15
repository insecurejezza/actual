import React, { useState } from 'react';
import { Form } from 'react-aria-components';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { InitialFocus } from '@actual-app/components/initial-focus';
import { View } from '@actual-app/components/view';
import type { IntegerAmount } from '@actual-app/core/shared/util';
import type { CategoryGroupEntity } from '@actual-app/core/types/models';

import { CategoryGroupAutocomplete } from '#components/autocomplete/CategoryGroupAutocomplete';
import { FinancialInput } from '#components/util/FinancialInput';
import { useCategories } from '#hooks/useCategories';

type GroupTransferMenuProps = {
  group: CategoryGroupEntity;
  onSubmit: (amount: IntegerAmount, groupId: CategoryGroupEntity['id']) => void;
  onClose: () => void;
};

/**
 * Shift an amount of one group's To Distribute to another group's. Only
 * expense groups are offered, and never this group itself — a group cannot
 * hand money to the place it already is.
 */
export function GroupTransferMenu({
  group,
  onSubmit,
  onClose,
}: GroupTransferMenuProps) {
  const { t } = useTranslation();

  const { data: { grouped: categoryGroups } = { grouped: [] } } =
    useCategories();
  const destinationGroups = categoryGroups.filter(
    g => !g.is_income && g.id !== group.id,
  );

  const [amount, setAmount] = useState<IntegerAmount>(0);
  const [toGroupId, setToGroupId] = useState<CategoryGroupEntity['id'] | null>(
    null,
  );

  return (
    <Form
      onSubmit={e => {
        e.preventDefault();
        if (amount > 0 && toGroupId) {
          onSubmit(amount, toGroupId);
        }
        onClose();
      }}
    >
      <View style={{ padding: 10 }}>
        <View style={{ marginBottom: 5 }}>
          <Trans>Transfer this amount:</Trans>
        </View>
        <View>
          <InitialFocus>
            <FinancialInput value={amount} onUpdate={setAmount} />
          </InitialFocus>
        </View>
        <View style={{ margin: '10px 0 5px 0' }}>
          <Trans>To group:</Trans>
        </View>

        <CategoryGroupAutocomplete
          categoryGroups={destinationGroups}
          value={null}
          openOnFocus
          onSelect={(id: string | undefined) => setToGroupId(id || null)}
          inputProps={{ placeholder: t('(none)') }}
        />

        <View style={{ alignItems: 'flex-end', marginTop: 10 }}>
          <Button
            type="submit"
            variant="primary"
            isDisabled={!toGroupId || amount <= 0}
            style={{ fontSize: 12, paddingTop: 3, paddingBottom: 3 }}
          >
            <Trans>Transfer</Trans>
          </Button>
        </View>
      </View>
    </Form>
  );
}
