import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  MailAccountCard,
  MailboxSidebar,
  MailConversationView,
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

  it('switches mailbox sidebar views and provider folders', () => {
    const onFolderChange = vi.fn();
    const onSmartViewChange = vi.fn();
    render(
      <MailboxSidebar
        accountId='account-1'
        accounts={[
          {
            id: 'account-1',
            userId: 'user-1',
            provider: { type: 'gmail', name: 'google' },
            address: 'user@example.com',
            scopes: [],
            status: 'active',
            isDefault: true,
          },
        ]}
        folders={[
          {
            id: 'folder-1',
            accountId: 'account-1',
            providerFolderId: 'INBOX',
            type: 'inbox',
            name: 'Inbox',
            unreadCount: 3,
            kind: 'label',
          },
        ]}
        labels={{
          account: 'Account',
          allMail: 'All mail',
          unread: 'Unread',
          starred: 'Starred',
          folders: 'Folders',
        }}
        onAccountChange={vi.fn()}
        onFolderChange={onFolderChange}
        onSmartViewChange={onSmartViewChange}
        smartView='all'
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Inbox/ }));
    expect(onSmartViewChange).toHaveBeenCalledWith('all');
    expect(onFolderChange).toHaveBeenCalledWith('INBOX');
  });

  it('renders every synchronized message in a provider conversation', () => {
    render(
      <MailConversationView
        labels={{
          attachmentCount: (count) => `${count} attachments`,
          conversation: (count) => `${count} messages`,
          loadMore: 'Load more',
          noSubject: '(no subject)',
          selectMessage: 'Select a message',
          unknownSender: 'Unknown sender',
        }}
        messages={[
          conversationMessage('message-1', 'Alice', 'First message'),
          conversationMessage('message-2', 'Bob', 'Second message'),
        ]}
        onLoadMore={vi.fn()}
        subject='Project update'
      />,
    );

    expect(screen.getByText('2 messages')).toBeInTheDocument();
    expect(screen.getByText('First message')).toBeInTheDocument();
    expect(screen.getByText('Second message')).toBeInTheDocument();
  });

  it('renders HTML-only messages as safe plain text', () => {
    render(
      <MailConversationView
        labels={{
          attachmentCount: (count) => `${count} attachments`,
          conversation: (count) => `${count} messages`,
          loadMore: 'Load more',
          noSubject: '(no subject)',
          selectMessage: 'Select a message',
          unknownSender: 'Unknown sender',
        }}
        messages={[
          {
            ...conversationMessage('message-1', 'Alice', ''),
            html: '<p>Hello <strong>team</strong></p><script>bad()</script>',
          },
        ]}
        onLoadMore={vi.fn()}
      />,
    );

    expect(screen.getByText(/Hello team/)).toBeInTheDocument();
    expect(screen.queryByText(/bad\(\)/)).not.toBeInTheDocument();
    expect(document.querySelector('script')).not.toBeInTheDocument();
  });
});

function conversationMessage(id: string, name: string, text: string) {
  return {
    id,
    accountId: 'account-1',
    providerMessageId: id,
    conversationId: 'conversation-1',
    folderIds: ['INBOX'],
    from: { name, address: `${name.toLowerCase()}@example.com` },
    to: [],
    cc: [],
    bcc: [],
    replyTo: [],
    references: [],
    subject: 'Project update',
    text,
    read: true,
    starred: false,
    draft: false,
    hasAttachments: false,
    attachments: [],
  } as const;
}
