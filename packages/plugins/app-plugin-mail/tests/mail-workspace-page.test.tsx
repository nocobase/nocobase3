import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mail = vi.hoisted(() => ({
  deleteMessage: vi.fn(),
  downloadAttachment: vi.fn(),
  getSyncRun: vi.fn(),
  getMessage: vi.fn(),
  listAccounts: vi.fn(),
  listManagementAccounts: vi.fn(),
  listManagedFolders: vi.fn(),
  listManagedMessages: vi.fn(),
  manageMessages: vi.fn(),
  listProviders: vi.fn(),
  listConversationMessages: vi.fn(),
  listFolders: vi.fn(),
  listLabels: vi.fn(),
  listIdentities: vi.fn(),
  listSignatures: vi.fn(),
  listMessages: vi.fn(),
  listTemplates: vi.fn(),
  sendMessage: vi.fn(),
  sendBulk: vi.fn(),
  saveDraft: vi.fn(),
  startSync: vi.fn(),
  updateMessage: vi.fn(),
  updateMessageLabels: vi.fn(),
  createLabel: vi.fn(),
  moveMessage: vi.fn(),
  uploadAttachment: vi.fn(),
}));

vi.mock('../client/runtime.js', () => ({
  getMailClient: () => mail,
}));

import MailWorkspacePage from '../client/pages/mail-workspace-page.js';
import MailManagementPage from '../client/pages/mail-management-page.js';

describe('MailWorkspacePage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    for (const mock of Object.values(mail)) mock.mockReset();
    mail.listAccounts.mockResolvedValue([
      {
        id: 'account-1',
        userId: 'user-1',
        provider: { type: 'gmail', name: 'google' },
        address: 'user@example.com',
        scopes: [],
        status: 'active',
      },
    ]);
    mail.listManagementAccounts.mockResolvedValue([
      {
        id: 'account-1',
        userId: 'user-1',
        provider: { type: 'gmail', name: 'google' },
        address: 'user@example.com',
        scopes: [],
        status: 'active',
        canSync: false,
      },
    ]);
    mail.listProviders.mockResolvedValue([
      {
        type: 'gmail',
        name: 'google',
        label: 'Gmail',
        connection: 'oauth',
        capabilities: {
          receive: true,
          send: true,
          incrementalSync: true,
          pushNotifications: true,
          folders: true,
          labels: true,
          drafts: true,
          moveMessage: true,
          aliases: true,
        },
      },
    ]);
    mail.listFolders.mockResolvedValue([]);
    mail.deleteMessage.mockResolvedValue(undefined);
    mail.listManagedFolders.mockResolvedValue([]);
    mail.listLabels.mockResolvedValue([]);
    mail.listIdentities.mockResolvedValue([
      {
        id: 'identity-1',
        accountId: 'account-1',
        address: 'user@example.com',
        isPrimary: true,
        canSend: true,
      },
    ]);
    mail.listSignatures.mockResolvedValue([]);
    mail.listMessages.mockResolvedValue({ items: [] });
    mail.listManagedMessages.mockResolvedValue({ items: [] });
    mail.manageMessages.mockResolvedValue({
      items: [],
      succeeded: 0,
      failed: 0,
    });
    mail.listTemplates.mockResolvedValue([]);
    mail.sendMessage.mockResolvedValue({
      id: 'submission-1',
      accountId: 'account-1',
      status: 'accepted',
    });
    mail.sendBulk.mockResolvedValue([]);
    mail.saveDraft.mockResolvedValue({ id: 'draft-1', draft: true });
    mail.uploadAttachment.mockResolvedValue({
      id: 'attachment-1',
      fileName: 'report.txt',
      contentType: 'text/plain',
      size: 6,
      expiresAt: '2026-09-08T00:00:00.000Z',
    });
    mail.startSync.mockResolvedValue({
      id: 'sync-1',
      accountId: 'account-1',
      mode: 'incremental',
      phase: 'incremental',
      status: 'pending',
      policy: { maxMessages: 10_000, batchSize: 200 },
      processedMessages: 0,
      processedPages: 0,
      createdAt: '2026-09-06T00:00:00.000Z',
      updatedAt: '2026-09-06T00:00:00.000Z',
    });
  });

  it('sends mail from the production workspace composer', async () => {
    render(<MailWorkspacePage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Compose' }));
    await waitFor(() => expect(mail.listIdentities).toHaveBeenCalled());
    expect(
      screen.queryByRole('combobox', { name: 'From' }),
    ).not.toBeInTheDocument();
    fireEvent.change(await screen.findByLabelText('TO'), {
      target: { value: 'recipient@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Subject'), {
      target: { value: 'Production message' },
    });
    const editor = screen.getByLabelText('Message body');
    editor.innerHTML = '<p>Message content</p>';
    fireEvent.input(editor);
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() =>
      expect(mail.sendMessage).toHaveBeenCalledWith({
        accountId: 'account-1',
        identityId: 'identity-1',
        signatureId: undefined,
        to: [{ address: 'recipient@example.com' }],
        cc: [],
        bcc: [],
        subject: 'Production message',
        text: 'Message content',
        html: '<p>Message content</p>',
        inReplyToMessageId: undefined,
        forwardOfMessageId: undefined,
        scheduledAt: undefined,
        draftMessageId: undefined,
        attachmentIds: [],
        retainedAttachmentIds: [],
        idempotencyKey: expect.any(String),
      }),
    );
  });

  it('keeps Cc and Bcc fields hidden until their text buttons are clicked', async () => {
    render(<MailWorkspacePage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Compose' }));

    expect(document.getElementById('mail-compose-cc')).not.toBeInTheDocument();
    expect(document.getElementById('mail-compose-bcc')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cc' }));
    expect(document.getElementById('mail-compose-cc')).toBeInTheDocument();
    expect(document.getElementById('mail-compose-bcc')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Bcc' }));
    expect(document.getElementById('mail-compose-bcc')).toBeInTheDocument();
  });

  it('shows the scheduled time only after enabling scheduled send', async () => {
    render(<MailWorkspacePage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Compose' }));
    await waitFor(() =>
      expect(mail.listIdentities).toHaveBeenCalledWith('account-1'),
    );
    fireEvent.change(screen.getByLabelText('TO'), {
      target: { value: 'recipient@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Subject'), {
      target: { value: 'Scheduled message' },
    });
    const editor = screen.getByLabelText('Message body');
    editor.innerHTML = '<p>Message content</p>';
    fireEvent.input(editor);

    expect(
      document.getElementById('mail-compose-scheduled-at'),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Schedule send' }));
    const send = screen.getByRole('button', { name: 'Send' });
    expect(send).toBeDisabled();

    const scheduledAt = '2099-01-01T10:30';
    fireEvent.change(screen.getByLabelText('Send later (optional)'), {
      target: { value: scheduledAt },
    });
    expect(screen.getByRole('button', { name: 'Schedule send' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Schedule send' }));

    await waitFor(() =>
      expect(mail.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          scheduledAt: new Date(scheduledAt).toISOString(),
        }),
      ),
    );
  });

  it('opens all accounts first', async () => {
    mail.listAccounts.mockResolvedValue([
      {
        id: 'account-1',
        userId: 'user-1',
        provider: { type: 'gmail', name: 'google' },
        address: 'first@example.com',
        scopes: [],
        status: 'active',
      },
      {
        id: 'account-2',
        userId: 'user-1',
        provider: { type: 'gmail', name: 'google' },
        address: 'default@example.com',
        scopes: [],
        status: 'active',
      },
    ]);

    render(<MailWorkspacePage />);

    expect(await screen.findByLabelText('Account')).toHaveValue('');
    await waitFor(() =>
      expect(mail.listMessages).toHaveBeenCalledWith(
        expect.objectContaining({ accountId: undefined }),
      ),
    );
    const folders = screen.getAllByRole('navigation', { name: 'Folders' })[1];
    expect(
      within(folders)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Inbox', 'Sent', 'Drafts', 'Trash', 'Spam', 'Archive']);
  });

  it('keeps connected accounts visible when optional labels loading fails', async () => {
    mail.listAccounts.mockResolvedValue([
      {
        id: 'account-1',
        userId: 'user-1',
        provider: { type: 'gmail', name: 'google' },
        address: 'first@example.com',
        scopes: [],
        status: 'active',
      },
      {
        id: 'account-2',
        userId: 'user-1',
        provider: { type: 'gmail', name: 'google' },
        address: 'second@example.com',
        scopes: [],
        status: 'active',
      },
    ]);
    mail.listLabels.mockRejectedValueOnce(new Error('labels unavailable'));

    render(<MailWorkspacePage />);

    const accountSelect = await screen.findByLabelText('Account');
    expect(
      within(accountSelect).getByRole('option', {
        name: 'first@example.com',
      }),
    ).toBeInTheDocument();
    expect(
      within(accountSelect).getByRole('option', {
        name: 'second@example.com',
      }),
    ).toBeInTheDocument();
  });

  it('shows the standard folders and custom folders for a selected account', async () => {
    mail.listFolders.mockResolvedValue([
      {
        id: 'folder-custom',
        accountId: 'account-1',
        providerFolderId: 'Projects',
        type: 'custom',
        name: 'Projects',
        kind: 'folder',
      },
    ]);

    render(<MailWorkspacePage />);
    fireEvent.change(await screen.findByLabelText('Account'), {
      target: { value: 'account-1' },
    });

    await waitFor(() => {
      const folders = screen.getAllByRole('navigation', { name: 'Folders' })[1];
      expect(
        within(folders)
          .getAllByRole('button')
          .map((button) => button.textContent),
      ).toEqual([
        'Inbox',
        'Sent',
        'Drafts',
        'Trash',
        'Spam',
        'Archive',
        'Projects',
      ]);
    });
  });

  it('permanently deletes a message from Trash only after confirmation', async () => {
    const message = {
      id: 'message-trash',
      accountId: 'account-1',
      providerMessageId: 'provider-trash',
      folderIds: ['TRASH'],
      labelIds: [],
      from: { address: 'sender@example.com' },
      to: [{ address: 'user@example.com' }],
      cc: [],
      bcc: [],
      subject: 'Trash message',
      preview: 'Remove permanently',
      read: true,
      starred: false,
      draft: false,
      hasAttachments: false,
      attachments: [],
      todo: false,
    };
    mail.listFolders.mockResolvedValue([
      {
        id: 'folder-trash',
        accountId: 'account-1',
        providerFolderId: 'TRASH',
        type: 'trash',
        name: 'Trash',
        kind: 'folder',
      },
    ]);
    mail.listMessages.mockResolvedValue({ items: [message] });
    mail.getMessage.mockResolvedValue(message);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);

    try {
      render(<MailWorkspacePage />);
      fireEvent.change(await screen.findByLabelText('Account'), {
        target: { value: 'account-1' },
      });
      fireEvent.click(await screen.findByText('Trash message'));
      await screen.findByRole('heading', { name: 'Trash message' });
      fireEvent.click(
        screen.getByRole('button', { name: 'Permanently delete' }),
      );

      expect(confirm).toHaveBeenCalledWith(
        'Permanently delete this message? This action cannot be undone.',
      );
      expect(mail.deleteMessage).toHaveBeenCalledWith(
        'account-1',
        'message-trash',
        true,
      );
    } finally {
      confirm.mockRestore();
    }
  });

  it('groups messages from the same conversation into one mailbox row', async () => {
    mail.listMessages.mockResolvedValue({
      items: [
        {
          id: 'message-1',
          accountId: 'account-1',
          providerMessageId: 'provider-message-1',
          conversationId: 'conversation-1',
          folderIds: ['INBOX'],
          labelIds: [],
          from: { address: 'latest@example.com' },
          to: [{ address: 'user@example.com' }],
          cc: [],
          bcc: [],
          subject: 'Project update',
          preview: 'Latest update',
          receivedAt: '2026-09-08T00:00:00.000Z',
          read: false,
          starred: false,
          draft: false,
          hasAttachments: false,
          todo: false,
        },
        {
          id: 'message-2',
          accountId: 'account-1',
          providerMessageId: 'provider-message-2',
          conversationId: 'conversation-1',
          folderIds: ['INBOX'],
          labelIds: [],
          from: { address: 'older@example.com' },
          to: [{ address: 'user@example.com' }],
          cc: [],
          bcc: [],
          subject: ' Re:   project   update ',
          preview: 'Older update',
          receivedAt: '2026-09-07T00:00:00.000Z',
          read: true,
          starred: true,
          draft: false,
          hasAttachments: true,
          todo: true,
        },
      ],
    });

    render(<MailWorkspacePage />);

    expect(await screen.findByText('Project update')).toBeInTheDocument();
    expect(screen.getAllByText('Project update')).toHaveLength(1);
    expect(screen.getByText('2', { exact: true })).toBeInTheDocument();
  });

  it('disables sending and synchronization for an inactive account', async () => {
    mail.listAccounts.mockResolvedValue([
      {
        id: 'account-1',
        userId: 'user-1',
        provider: { type: 'gmail', name: 'google' },
        address: 'user@example.com',
        scopes: [],
        status: 'suspended',
      },
    ]);

    render(<MailWorkspacePage />);

    expect(
      await screen.findByRole('button', { name: 'Compose' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Sync all mailboxes' }),
    ).toBeDisabled();
  });

  it('keeps the selected signature when sending individual messages', async () => {
    mail.listSignatures.mockResolvedValue([
      {
        id: 'signature-1',
        accountId: 'account-1',
        name: 'Support signature',
        text: 'Regards, Support',
        isDefault: false,
        createdAt: '2026-09-08T00:00:00.000Z',
        updatedAt: '2026-09-08T00:00:00.000Z',
      },
    ]);
    render(<MailWorkspacePage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Compose' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Signature' }));
    fireEvent.click(
      await screen.findByRole('menuitem', { name: 'Support signature' }),
    );
    fireEvent.change(screen.getByLabelText('TO'), {
      target: { value: 'recipient@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Subject'), {
      target: { value: 'Private message' },
    });
    const editor = screen.getByLabelText('Message body');
    editor.innerHTML = '<p>Message content</p>';
    fireEvent.input(editor);
    fireEvent.click(
      screen.getByRole('checkbox', {
        name: 'Send one private message per recipient (up to 100)',
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() =>
      expect(mail.sendBulk).toHaveBeenCalledWith(
        expect.objectContaining({
          signatureId: 'signature-1',
          recipients: [{ address: 'recipient@example.com' }],
        }),
      ),
    );
  });

  it('inserts the default signature and replaces it when another signature is selected', async () => {
    mail.listSignatures.mockResolvedValue([
      {
        id: 'signature-default',
        accountId: 'account-1',
        name: 'Default',
        text: 'Regards, Sales',
        html: '<p>Regards, Sales</p>',
        isDefault: true,
        createdAt: '2026-09-08T00:00:00.000Z',
        updatedAt: '2026-09-08T00:00:00.000Z',
      },
      {
        id: 'signature-support',
        accountId: 'account-1',
        name: 'Support',
        text: 'Support team',
        html: '<p>Support team</p>',
        isDefault: false,
        createdAt: '2026-09-08T00:00:00.000Z',
        updatedAt: '2026-09-08T00:00:00.000Z',
      },
    ]);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);

    try {
      render(<MailWorkspacePage />);
      fireEvent.click(await screen.findByRole('button', { name: 'Compose' }));
      const editor = await screen.findByLabelText('Message body');
      await waitFor(() => expect(editor).toHaveTextContent('Regards, Sales'));
      fireEvent.click(screen.getByRole('button', { name: 'Signature' }));
      fireEvent.click(await screen.findByRole('menuitem', { name: 'Support' }));
      expect(editor).toHaveTextContent('Support team');
      expect(editor).not.toHaveTextContent('Regards, Sales');
      fireEvent.click(screen.getByRole('button', { name: 'Signature' }));
      fireEvent.click(screen.getByRole('menuitem', { name: 'No signature' }));
      expect(editor).not.toHaveTextContent('Support team');
    } finally {
      confirm.mockRestore();
    }
  });

  it('does not allow sending without a subject and message body', async () => {
    render(<MailWorkspacePage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Compose' }));
    fireEvent.change(screen.getByLabelText('TO'), {
      target: { value: 'recipient@example.com' },
    });
    const send = screen.getByRole('button', { name: 'Send' });
    expect(send).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Subject'), {
      target: { value: 'Subject' },
    });
    expect(send).toBeDisabled();

    const editor = screen.getByLabelText('Message body');
    editor.innerHTML = '<p>Message content</p>';
    fireEvent.input(editor);
    await waitFor(() => expect(send).toBeEnabled());
  });

  it('keeps local labels available even when IMAP has no Provider label support', async () => {
    const message = {
      id: 'message-1',
      accountId: 'account-1',
      providerMessageId: 'imap-message-1',
      folderIds: ['INBOX'],
      labelIds: [],
      from: { address: 'sender@example.com' },
      to: [{ address: 'user@example.com' }],
      cc: [],
      bcc: [],
      replyTo: [],
      references: [],
      subject: 'IMAP message',
      text: 'Message content',
      read: true,
      starred: false,
      draft: false,
      hasAttachments: false,
      attachments: [],
    };
    mail.listAccounts.mockResolvedValue([
      {
        id: 'account-1',
        userId: 'user-1',
        provider: { type: 'imap-smtp', name: 'personal' },
        address: 'user@example.com',
        scopes: [],
        status: 'active',
      },
    ]);
    mail.listProviders.mockResolvedValue([
      {
        type: 'imap-smtp',
        name: 'personal',
        label: 'IMAP / SMTP',
        connection: 'credentials',
        capabilities: {
          receive: true,
          send: true,
          incrementalSync: true,
          pushNotifications: false,
          folders: true,
          labels: false,
          drafts: false,
          moveMessage: false,
          aliases: false,
        },
      },
    ]);
    mail.listFolders.mockResolvedValue([
      {
        id: 'archive',
        accountId: 'account-1',
        providerFolderId: 'Archive',
        type: 'archive',
        name: 'Archive',
        kind: 'folder',
      },
    ]);
    mail.listLabels.mockResolvedValue([
      {
        id: 'local-label-1',
        name: 'Local label',
        color: 'green',
        createdAt: '2026-09-08T00:00:00.000Z',
        updatedAt: '2026-09-08T00:00:00.000Z',
      },
    ]);
    mail.listMessages.mockResolvedValue({ items: [message] });
    mail.getMessage.mockResolvedValue(message);

    render(<MailWorkspacePage />);

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Compose' })).toBeEnabled(),
    );
    expect(screen.queryByRole('button', { name: 'New label' })).toBeNull();
    fireEvent.click(await screen.findByText('IMAP message'));
    await screen.findByRole('heading', { name: 'IMAP message' });
    const conversation = screen
      .getByRole('heading', { name: 'IMAP message' })
      .closest('section');
    if (!conversation) throw new Error('Missing conversation view');
    expect(
      within(conversation).queryByRole('button', { name: 'Archive' }),
    ).toBe(null);
    fireEvent.click(
      within(conversation).getByRole('button', { name: 'Labels' }),
    );
    expect(
      within(screen.getByRole('dialog')).getByRole('checkbox', {
        name: 'Local label',
      }),
    ).toBeInTheDocument();
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Close' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Compose' }));
    expect(
      screen.getByRole('button', { name: 'Save draft' }),
    ).toBeInTheDocument();
  });

  it('auto-saves rich text and updates the same Provider draft', async () => {
    vi.useFakeTimers();
    try {
      render(<MailWorkspacePage />);
      await vi.waitFor(() => expect(mail.listAccounts).toHaveBeenCalled());

      fireEvent.click(screen.getByRole('button', { name: 'Compose' }));
      await vi.waitFor(() => expect(mail.listIdentities).toHaveBeenCalled());
      fireEvent.change(screen.getByLabelText('Subject'), {
        target: { value: 'Auto-saved message' },
      });
      const editor = screen.getByLabelText('Message body');
      editor.innerHTML = '<p>Hello <strong>team</strong></p>';
      fireEvent.input(editor);
      await vi.advanceTimersByTimeAsync(1_000);
      await vi.waitFor(() => expect(mail.saveDraft).toHaveBeenCalledTimes(1));
      expect(mail.saveDraft).toHaveBeenLastCalledWith(
        expect.objectContaining({
          draftMessageId: undefined,
          subject: 'Auto-saved message',
          text: 'Hello team',
          html: '<p>Hello <strong>team</strong></p>',
        }),
      );

      fireEvent.change(screen.getByLabelText('Subject'), {
        target: { value: 'Updated message' },
      });
      await vi.advanceTimersByTimeAsync(1_000);
      await vi.waitFor(() => expect(mail.saveDraft).toHaveBeenCalledTimes(2));
      expect(mail.saveDraft).toHaveBeenLastCalledWith(
        expect.objectContaining({
          draftMessageId: 'draft-1',
          subject: 'Updated message',
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('restores an unfinished composer snapshot on demand', async () => {
    window.sessionStorage.setItem(
      'nocobase:mail:composer-recovery:v1:account-1',
      JSON.stringify({
        version: 1,
        accountId: 'account-1',
        identityId: 'identity-1',
        composer: {
          mode: 'new',
          to: 'customer@example.com',
          cc: '',
          bcc: '',
          subject: 'Recovered subject',
          text: 'Recovered body',
          html: '<p>Recovered body</p>',
          scheduledAt: '',
        },
        composeAttachments: [],
        retainedAttachments: [],
      }),
    );
    render(<MailWorkspacePage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Compose' }));
    expect(
      await screen.findByText('An unfinished message can be restored.'),
    ).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    expect(screen.getByLabelText('Subject')).toHaveValue('Recovered subject');
    expect(screen.getByLabelText('Message body')).toHaveTextContent(
      'Recovered body',
    );
  });

  it('protects unsaved content when the composer is closed', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<MailWorkspacePage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Compose' }));
    fireEvent.change(screen.getByLabelText('Subject'), {
      target: { value: 'Keep this message' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(confirm).toHaveBeenCalledWith(
      'This message has changes that have not been saved. Close it anyway?',
    );
    expect(screen.getByLabelText('Subject')).toHaveValue('Keep this message');
    confirm.mockRestore();
  });

  it('binds current record values when applying a template', async () => {
    mail.listTemplates.mockResolvedValue([
      {
        id: 'template-1',
        name: 'Order update',
        subject: 'Order {{record.number}}',
        text: 'Hello {{record.customer.name}}',
        html: '<p>Hello <strong>{{record.customer.name}}</strong></p>',
        scope: 'private',
      },
    ]);
    render(
      <MailWorkspacePage
        templateVariables={{
          record: { number: 'SO-1001', customer: { name: 'Ada' } },
        }}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Compose' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Template' }));
    fireEvent.click(
      await screen.findByRole('menuitem', { name: 'Order update' }),
    );
    expect(screen.getByLabelText('Subject')).toHaveValue('Order SO-1001');
    expect(screen.getByLabelText('Message body')).toHaveTextContent(
      'Hello Ada',
    );
  });

  it('uploads and submits composer attachments', async () => {
    render(<MailWorkspacePage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Compose' }));
    const input = document.querySelector('input[type="file"]');
    if (!(input instanceof HTMLInputElement))
      throw new Error('Missing file input');
    const file = new File(['report'], 'report.txt', { type: 'text/plain' });
    fireEvent.change(input, { target: { files: [file] } });
    expect(await screen.findByText('report.txt')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('TO'), {
      target: { value: 'recipient@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Subject'), {
      target: { value: 'Attachment message' },
    });
    const editor = screen.getByLabelText('Message body');
    editor.innerHTML = '<p>Message with attachment</p>';
    fireEvent.input(editor);
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() =>
      expect(mail.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ attachmentIds: ['attachment-1'] }),
      ),
    );
    expect(mail.uploadAttachment).toHaveBeenCalledWith(file);
  });

  it('promotes uploaded attachments to retained Provider attachments after auto-save', async () => {
    vi.useFakeTimers();
    try {
      mail.saveDraft.mockResolvedValue({
        id: 'draft-1',
        draft: true,
        attachments: [
          {
            id: 'draft-1:provider-attachment-1',
            messageId: 'draft-1',
            providerAttachmentId: 'provider-attachment-1',
            fileName: 'report.txt',
            contentType: 'text/plain',
            size: 6,
            inline: false,
          },
        ],
      });
      render(<MailWorkspacePage />);
      await vi.waitFor(() => expect(mail.listAccounts).toHaveBeenCalled());
      fireEvent.click(screen.getByRole('button', { name: 'Compose' }));
      const input = document.querySelector('input[type="file"]');
      if (!(input instanceof HTMLInputElement))
        throw new Error('Missing file input');
      fireEvent.change(input, {
        target: {
          files: [new File(['report'], 'report.txt', { type: 'text/plain' })],
        },
      });
      await vi.waitFor(() => expect(mail.uploadAttachment).toHaveBeenCalled());
      fireEvent.change(screen.getByLabelText('Subject'), {
        target: { value: 'First save' },
      });
      await vi.advanceTimersByTimeAsync(1_000);
      await vi.waitFor(() => expect(mail.saveDraft).toHaveBeenCalledTimes(1));

      fireEvent.change(screen.getByLabelText('Subject'), {
        target: { value: 'Second save' },
      });
      await vi.advanceTimersByTimeAsync(1_000);
      await vi.waitFor(() => expect(mail.saveDraft).toHaveBeenCalledTimes(2));
      expect(mail.saveDraft).toHaveBeenLastCalledWith(
        expect.objectContaining({
          attachmentIds: [],
          retainedAttachmentIds: ['draft-1:provider-attachment-1'],
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('syncs the current all-account scope by default', async () => {
    render(<MailWorkspacePage />);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Sync all mailboxes' }),
    );

    await waitFor(() =>
      expect(mail.startSync).toHaveBeenCalledWith({
        accountId: 'account-1',
      }),
    );
  });

  it('syncs every active account when the workspace is in all-account scope', async () => {
    mail.listAccounts.mockResolvedValue([
      {
        id: 'account-1',
        userId: 'user-1',
        provider: { type: 'gmail', name: 'google' },
        address: 'first@example.com',
        scopes: [],
        status: 'active',
      },
      {
        id: 'account-2',
        userId: 'user-1',
        provider: { type: 'gmail', name: 'google' },
        address: 'second@example.com',
        scopes: [],
        status: 'active',
      },
    ]);
    mail.startSync.mockImplementation(async ({ accountId }) => ({
      id: `sync-${accountId}`,
      accountId,
      mode: 'incremental',
      phase: 'incremental',
      status: 'pending',
      policy: { maxMessages: 10_000, batchSize: 200 },
      processedMessages: 0,
      processedPages: 0,
      createdAt: '2026-09-06T00:00:00.000Z',
      updatedAt: '2026-09-06T00:00:00.000Z',
    }));

    render(<MailWorkspacePage />);

    const sync = await screen.findByRole('button', {
      name: 'Sync all mailboxes',
    });
    await waitFor(() => expect(sync).toBeEnabled());
    fireEvent.click(sync);

    await waitFor(() => expect(mail.startSync).toHaveBeenCalledTimes(2));
    expect(mail.startSync).toHaveBeenNthCalledWith(1, {
      accountId: 'account-1',
    });
    expect(mail.startSync).toHaveBeenNthCalledWith(2, {
      accountId: 'account-2',
    });
  });

  it('uses the browser-cached account when opening a new composer', async () => {
    mail.listAccounts.mockResolvedValue([
      {
        id: 'account-1',
        userId: 'user-1',
        provider: { type: 'gmail', name: 'google' },
        address: 'first@example.com',
        scopes: [],
        status: 'active',
      },
      {
        id: 'account-2',
        userId: 'user-1',
        provider: { type: 'gmail', name: 'google' },
        address: 'second@example.com',
        scopes: [],
        status: 'active',
      },
    ]);
    mail.listIdentities.mockImplementation(async (accountId) => [
      {
        id: `identity-${accountId}`,
        accountId,
        address:
          accountId === 'account-2'
            ? 'second@example.com'
            : 'first@example.com',
        isPrimary: true,
        canSend: true,
      },
    ]);
    window.localStorage.setItem(
      'nocobase:mail:last-compose-account:v1:user-1',
      'account-2',
    );

    render(<MailWorkspacePage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Compose' }));
    await waitFor(() =>
      expect(mail.listIdentities).toHaveBeenCalledWith('account-2'),
    );
    fireEvent.change(screen.getByLabelText('TO'), {
      target: { value: 'recipient@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Subject'), {
      target: { value: 'Cached account message' },
    });
    const editor = screen.getByLabelText('Message body');
    editor.innerHTML = '<p>Message content</p>';
    fireEvent.input(editor);
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() =>
      expect(mail.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          accountId: 'account-2',
          identityId: 'identity-account-2',
        }),
      ),
    );
  });

  it('edits an existing draft and can remove its retained attachment', async () => {
    const draft = {
      id: 'draft-1',
      accountId: 'account-1',
      providerMessageId: 'provider-draft-1',
      providerDraftId: 'provider-draft-resource-1',
      folderIds: ['DRAFT'],
      labelIds: [],
      from: { address: 'user@example.com' },
      to: [{ address: 'recipient@example.com' }],
      cc: [],
      bcc: [],
      replyTo: [],
      references: [],
      subject: 'Existing draft',
      text: 'Draft content',
      read: true,
      starred: false,
      draft: true,
      hasAttachments: true,
      attachments: [
        {
          id: 'draft-1:provider-attachment-1',
          messageId: 'draft-1',
          providerAttachmentId: 'provider-attachment-1',
          fileName: 'old.txt',
          contentType: 'text/plain',
          size: 3,
          inline: false,
        },
      ],
    };
    mail.listMessages.mockResolvedValue({ items: [draft] });
    mail.getMessage.mockResolvedValue(draft);
    render(<MailWorkspacePage />);

    fireEvent.click(await screen.findByText('Existing draft'));
    fireEvent.click(await screen.findByRole('button', { name: 'Edit draft' }));
    expect((await screen.findAllByText('old.txt')).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Remove old.txt' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));

    await waitFor(() =>
      expect(mail.saveDraft).toHaveBeenCalledWith(
        expect.objectContaining({
          draftMessageId: 'draft-1',
          retainedAttachmentIds: [],
        }),
      ),
    );
  });

  it('lists synchronized messages across every account in the management table', async () => {
    mail.listManagedMessages.mockResolvedValue({
      items: [
        {
          id: 'message-1',
          accountId: 'account-1',
          providerMessageId: 'provider-message-1',
          folderIds: ['INBOX'],
          labelIds: [],
          from: { address: 'sender@example.com' },
          to: [{ address: 'user@example.com' }],
          cc: [],
          bcc: [],
          subject: 'Management table message',
          read: false,
          starred: false,
          draft: false,
          hasAttachments: false,
          receivedAt: '2026-09-07T00:00:00.000Z',
        },
      ],
    });

    render(<MailManagementPage />);

    expect(
      await screen.findByText('Management table message'),
    ).toBeInTheDocument();
    expect(mail.listManagedMessages).toHaveBeenCalledWith({
      accountId: undefined,
      query: undefined,
      limit: 100,
    });
  });

  it('runs a management action for selected rows and keeps failed rows selected', async () => {
    const messages = [
      {
        id: 'message-1',
        accountId: 'account-1',
        providerMessageId: 'provider-message-1',
        folderIds: ['INBOX'],
        labelIds: [],
        from: { address: 'sender@example.com' },
        to: [{ address: 'user@example.com' }],
        cc: [],
        bcc: [],
        subject: 'First management message',
        read: false,
        starred: false,
        draft: false,
        hasAttachments: false,
      },
      {
        id: 'message-2',
        accountId: 'account-1',
        providerMessageId: 'provider-message-2',
        folderIds: ['INBOX'],
        labelIds: [],
        from: { address: 'sender@example.com' },
        to: [{ address: 'user@example.com' }],
        cc: [],
        bcc: [],
        subject: 'Second management message',
        read: false,
        starred: false,
        draft: false,
        hasAttachments: false,
      },
    ] as const;
    mail.listManagedMessages.mockResolvedValue({ items: messages });
    mail.manageMessages.mockResolvedValue({
      items: [
        {
          accountId: 'account-1',
          messageId: 'message-1',
          status: 'succeeded',
        },
        {
          accountId: 'account-1',
          messageId: 'message-2',
          status: 'failed',
          error: {
            code: 'MAIL_MANAGEMENT_ACTION_FAILED',
            category: 'unknown',
            retryable: false,
          },
        },
      ],
      succeeded: 1,
      failed: 1,
    });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<MailManagementPage />);

    expect(
      await screen.findByText('First management message'),
    ).toBeInTheDocument();
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[1]);
    fireEvent.click(checkboxes[2]);
    fireEvent.click(screen.getByRole('button', { name: 'Mark read' }));

    await waitFor(() =>
      expect(mail.manageMessages).toHaveBeenCalledWith({
        action: 'markRead',
        items: [
          { accountId: 'account-1', messageId: 'message-1' },
          { accountId: 'account-1', messageId: 'message-2' },
        ],
      }),
    );
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByText(
        '1 succeeded, 1 failed. Failed messages remain selected for retry.',
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')[2]).toBeChecked();
    confirm.mockRestore();
  });
});
