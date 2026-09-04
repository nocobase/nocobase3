import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  MailAccountCard,
  MailProviderCard,
  MailSyncPolicyFields,
} from '../client/components/index.js';
import type {
  MailAccountView,
  MailProviderView,
} from '../client/mail-client.js';

const capabilities: MailProviderView['capabilities'] = {
  receive: true,
  send: true,
  incrementalSync: true,
  pushNotifications: false,
  folders: false,
  labels: true,
  drafts: false,
  moveMessage: false,
  aliases: true,
};

describe('Mail client components', () => {
  it('renders Provider capabilities and starts authorization', () => {
    const onConnect = vi.fn();
    const provider: MailProviderView = {
      type: 'gmail',
      name: 'google',
      label: 'Gmail',
      capabilities,
    };
    render(
      <MailProviderCard
        capabilityLabel={(capability) => capability}
        connectLabel='Connect account'
        connectedAccounts={1}
        connectedLabel='1 connected'
        onConnect={onConnect}
        provider={provider}
      />,
    );

    expect(screen.getByText('incrementalSync')).toBeInTheDocument();
    expect(screen.queryByText('pushNotifications')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Connect account' }));
    expect(onConnect).toHaveBeenCalledWith(provider);
  });

  it('prevents synchronization for an inactive account', () => {
    const account: MailAccountView = {
      id: 'account-1',
      userId: 'user-1',
      provider: { type: 'microsoft', name: 'work' },
      address: 'user@example.com',
      scopes: [],
      status: 'reauthorizationRequired',
      isDefault: false,
    };
    render(
      <MailAccountCard
        account={account}
        defaultLabel='Default'
        onSync={vi.fn()}
        providerLabel='Microsoft 365'
        statusLabel='Reauthorization required'
        syncLabel='Sync mailbox'
      />,
    );

    expect(screen.getByRole('button', { name: 'Sync mailbox' })).toBeDisabled();
  });

  it('reports sync-limit changes as one value', () => {
    const onChange = vi.fn();
    render(
      <MailSyncPolicyFields
        labels={{
          receivedAfter: 'Received after',
          maxMessages: 'Maximum messages',
          batchSize: 'Batch size',
        }}
        onChange={onChange}
        value={{
          receivedAfter: '2026-01-01',
          maxMessages: 1000,
          batchSize: 100,
        }}
      />,
    );

    fireEvent.change(screen.getByLabelText('Maximum messages'), {
      target: { value: '2500' },
    });
    expect(onChange).toHaveBeenCalledWith({
      receivedAfter: '2026-01-01',
      maxMessages: 2500,
      batchSize: 100,
    });
  });
});
