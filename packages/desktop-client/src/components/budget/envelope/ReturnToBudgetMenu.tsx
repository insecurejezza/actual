import React, { useState } from 'react';
import { Form } from 'react-aria-components';
import { Trans } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { InitialFocus } from '@actual-app/components/initial-focus';
import { View } from '@actual-app/components/view';
import type { IntegerAmount } from '@actual-app/core/shared/util';

import { FinancialInput } from '#components/util/FinancialInput';

type ReturnToBudgetMenuProps = {
  onSubmit: (amount: IntegerAmount) => void;
  onClose: () => void;
};

/**
 * Release an amount of a group's To Distribute back into To Budget. Unlike
 * every other group-budget action this one is not neutral — the money stops
 * being budgeted, so To Budget rises by exactly this amount.
 */
export function ReturnToBudgetMenu({
  onSubmit,
  onClose,
}: ReturnToBudgetMenuProps) {
  const [amount, setAmount] = useState<IntegerAmount>(0);

  return (
    <Form
      onSubmit={e => {
        e.preventDefault();
        if (amount > 0) {
          onSubmit(amount);
        }
        onClose();
      }}
    >
      <View style={{ padding: 10 }}>
        <View style={{ marginBottom: 5 }}>
          <Trans>Return this amount to To Budget:</Trans>
        </View>
        <View>
          <InitialFocus>
            <FinancialInput value={amount} onUpdate={setAmount} />
          </InitialFocus>
        </View>

        <View style={{ alignItems: 'flex-end', marginTop: 10 }}>
          <Button
            type="submit"
            variant="primary"
            isDisabled={amount <= 0}
            style={{ fontSize: 12, paddingTop: 3, paddingBottom: 3 }}
          >
            <Trans>Return</Trans>
          </Button>
        </View>
      </View>
    </Form>
  );
}
