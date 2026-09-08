import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mail = vi.hoisted(() => ({
  deleteMessage: vi.fn(),
  downloadAttachment: vi.fn(),
  getSyncRun: vi.fn(),
  getMessage: vi.fn(),
  listAccounts: vi.fn(),
  listConversationMessages: vi.fn(),
  listFolders: vi.fn(),
  listIdentities: vi.fn(),
  listMessages: vi.fn(),
  listTemplates: vi.fn(),
  sendMessage: vi.fn(),
  sendBulk: vi.fn(),
  saveDraft: vi.fn(),
  startSync: vi.fn(),
  updateMessage: vi.fn(),
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
    mail.listFolders.mockResolvedValue([]);
    mail.listIdentities.mockResolvedValue([
      {
        id: 'identity-1',
        accountId: 'account-1',
        address: 'user@example.com',
        isPrimary: true,
        canSend: true,
      },
    ]);
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
    fireEvent.change(screen.getByLabelText('Message body'), {
      target: { value: 'Message content' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() =>
      expect(mail.sendMessage).toHaveBeenCalledWith({
        accountId: 'account-1',
        identityId: 'identity-1',
        to: [{ address: 'recipient@example.com' }],
        cc: [],
        bcc: [],
        subject: 'Production message',
        text: 'Message content',
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
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() =>
      expect(mail.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ attachmentIds: ['attachment-1'] }),
      ),
    );
    expect(mail.uploadAttachment).toHaveBeenCalledWith(file);
  });

  it('runs incremental synchronization when refreshing the mailbox', async () => {
    render(<MailWorkspacePage />);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Sync updates' }),
    );

    await waitFor(() =>
      expect(mail.startSync).toHaveBeenCalledWith({
        accountId: 'account-1',
        mode: 'incremental',
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
