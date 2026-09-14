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
        isDefault: true,
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

  it('opens the configured default account first', async () => {
    mail.listAccounts.mockResolvedValue([
      {
        id: 'account-1',
        userId: 'user-1',
        provider: { type: 'gmail', name: 'google' },
        address: 'first@example.com',
        scopes: [],
        status: 'active',
        isDefault: false,
      },
      {
        id: 'account-2',
        userId: 'user-1',
        provider: { type: 'gmail', name: 'google' },
        address: 'default@example.com',
        scopes: [],
        status: 'active',
        isDefault: true,
      },
    ]);

    render(<MailWorkspacePage />);

    expect(await screen.findByLabelText('Account')).toHaveValue('account-2');
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
        isDefault: true,
      },
    ]);

    render(<MailWorkspacePage />);

    expect(
      await screen.findByRole('button', { name: 'Compose' }),
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Sync mailbox' })).toBeDisabled();
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
        isDefault: true,
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
    expect(screen.queryByRole('button', { name: 'Save draft' })).toBeNull();
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

  it('lets the server choose initial or incremental mode when syncing', async () => {
    render(<MailWorkspacePage />);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Sync mailbox' }),
    );

    await waitFor(() =>
      expect(mail.startSync).toHaveBeenCalledWith({
        accountId: 'account-1',
      }),
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
    mail.listMessages.mockResolvedValue({
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
    expect(mail.listMessages).toHaveBeenCalledWith({
      accountId: undefined,
      query: undefined,
      limit: 100,
    });
  });
});
