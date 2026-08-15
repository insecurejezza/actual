import React from 'react';

import { render, screen } from '@testing-library/react';

import {
  configureTestAppStore,
  createTestQueryClient,
  TestProviders,
} from '#mocks';
import { mergeSyncedPrefs } from '#prefs/prefsSlice';

import { GroupBudgetMenu } from './GroupBudgetMenu';

function renderMenu(flags: Record<string, string>) {
  const store = configureTestAppStore({ queryClient: createTestQueryClient() });
  store.dispatch(mergeSyncedPrefs(flags));

  render(
    <TestProviders store={store}>
      <GroupBudgetMenu
        onDistribute={vi.fn()}
        onCoverAllOverspending={vi.fn()}
        onTransferToGroup={vi.fn()}
        onReturnToBudget={vi.fn()}
        onEditAutomations={vi.fn()}
      />
    </TestProviders>,
  );
}

describe('GroupBudgetMenu', () => {
  it('offers the group automation when both template flags are on', () => {
    renderMenu({
      'flags.goalTemplatesEnabled': 'true',
      'flags.goalTemplatesUIEnabled': 'true',
    });

    expect(screen.getByText('Budget automations…')).toBeInTheDocument();
  });

  it('hides the group automation when the templates UI flag is off', () => {
    renderMenu({ 'flags.goalTemplatesEnabled': 'true' });

    expect(screen.queryByText('Budget automations…')).not.toBeInTheDocument();
    // The money-movement actions are not template-gated.
    expect(screen.getByText('Distribute an amount…')).toBeInTheDocument();
  });

  it('hides the group automation when templates are off entirely', () => {
    renderMenu({});

    expect(screen.queryByText('Budget automations…')).not.toBeInTheDocument();
  });
});
