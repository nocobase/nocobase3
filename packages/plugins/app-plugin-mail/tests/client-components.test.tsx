import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  MailAccountCard,
  MailAccountConnector,
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
  it('connects the mail account type selected by the user', () => {
    const onConnect = vi.fn();
    const providers: readonly MailProviderView[] = [
      {
        type: 'gmail',
        name: 'google',
        label: 'Gmail',
        capabilities,
      },
      {
        type: 'microsoft',
        name: 'work',
        label: 'Microsoft 365',
        capabilities,
      },
    ];
    render(
      <MailAccountConnector
        connectedAccountCount={() => 0}
        labels={{
          accountType: 'Mail account type',
          chooseAccountType: 'Select an account type',
          connect: 'Connect account',
          connecting: 'Opening authorization',
          connectedAccounts: (count) => `${count} connected`,
          capability: (capability) => capability,
        }}
        onConnect={onConnect}
        providers={providers}
      />,
    );

    const connect = screen.getByRole('button', { name: 'Connect account' });
    expect(connect).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Mail account type'), {
      target: { value: 'microsoft:work' },
    });
    expect(connect).toBeEnabled();
    fireEvent.click(connect);
    expect(onConnect).toHaveBeenCalledWith(providers[1]);
  });

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

  it('shows managed account ownership without exposing a sync action', () => {
    const account: MailAccountView = {
      id: 'account-2',
      userId: 'user-2',
      provider: { type: 'gmail', name: 'google' },
      address: 'other@example.com',
      scopes: [],
      status: 'active',
      isDefault: true,
    };
    render(
      <MailAccountCard
        account={account}
        canSync={false}
        defaultLabel='Default'
        onSync={vi.fn()}
        ownerLabel='User ID: user-2'
        providerLabel='Gmail'
        statusLabel='Active'
        syncLabel='Sync mailbox'
      />,
    );

    expect(screen.getByText('User ID: user-2')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Sync mailbox' }),
    ).not.toBeInTheDocument();
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

  it('dispatches conversation reply, forward, draft, and attachment actions', () => {
    const reply = vi.fn();
    const forward = vi.fn();
    const editDraft = vi.fn();
    const downloadAttachment = vi.fn();
    const message = {
      ...conversationMessage('message-1', 'Alice', 'Message body'),
      attachments: [
        {
          id: 'message-1:attachment-1',
          messageId: 'message-1',
          providerAttachmentId: 'attachment-1',
          fileName: 'report.pdf',
          contentType: 'application/pdf',
          size: 10,
          inline: false,
        },
      ],
      hasAttachments: true,
    };
    const props = {
      labels: {
        attachmentCount: (count: number) => `${count} attachments`,
        conversation: (count: number) => `${count} messages`,
        loadMore: 'Load more',
        noSubject: '(no subject)',
        selectMessage: 'Select a message',
        unknownSender: 'Unknown sender',
      },
      onLoadMore: vi.fn(),
      actions: {
        delete: vi.fn(),
        downloadAttachment,
        reply,
        forward,
        editDraft,
        toggleRead: vi.fn(),
        toggleStarred: vi.fn(),
      },
      actionLabels: {
        archive: 'Archive',
        delete: 'Delete',
        download: 'Download',
        reply: 'Reply',
        forward: 'Forward',
        editDraft: 'Edit draft',
        markRead: 'Mark read',
        markUnread: 'Mark unread',
        star: 'Star',
        unstar: 'Unstar',
      },
    } as const;
    const view = render(
      <MailConversationView {...props} messages={[message]} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Reply' }));
    fireEvent.click(screen.getByRole('button', { name: 'Forward' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Download report.pdf' }),
    );
    expect(reply).toHaveBeenCalledWith(message);
    expect(forward).toHaveBeenCalledWith(message);
    expect(downloadAttachment).toHaveBeenCalledWith(
      message,
      message.attachments[0],
    );

    view.rerender(
      <MailConversationView
        {...props}
        messages={[{ ...message, draft: true }]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit draft' }));
    expect(editDraft).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'message-1', draft: true }),
    );
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
