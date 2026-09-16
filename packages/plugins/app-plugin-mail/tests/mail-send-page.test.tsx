import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mail = vi.hoisted(() => ({
  listAccounts: vi.fn(),
  listProviders: vi.fn(),
  listIdentities: vi.fn(),
  listSignatures: vi.fn(),
  listTemplates: vi.fn(),
  sendMessage: vi.fn(),
  sendBulk: vi.fn(),
  downloadAttachment: vi.fn(),
  saveDraft: vi.fn(),
  uploadAttachment: vi.fn(),
}));
vi.mock('../client/runtime.js', () => ({ useMailClient: () => mail }));
import MailSendPage from '../client/pages/mail-send-page.js';

describe('MailSendPage', () => {
  beforeEach(() => {
    localStorage.clear();
    for (const mock of Object.values(mail)) mock.mockReset();
    mail.listAccounts.mockResolvedValue([
      {
        id: 'account',
        provider: { type: 'gmail', name: 'google' },
        status: 'active',
        address: 'sender@example.com',
      },
    ]);
    mail.listProviders.mockResolvedValue([
      {
        type: 'gmail',
        name: 'google',
        capabilities: { send: true, drafts: true },
      },
    ]);
    mail.listIdentities.mockResolvedValue([
      {
        id: 'sender',
        address: 'sender@example.com',
        isPrimary: true,
        canSend: true,
      },
    ]);
    mail.listSignatures.mockResolvedValue([]);
    mail.listTemplates.mockResolvedValue([]);
    mail.sendMessage.mockResolvedValue({ status: 'accepted' });
    mail.sendBulk.mockResolvedValue([
      { status: 'pending' },
      { status: 'pending' },
    ]);
    mail.saveDraft.mockResolvedValue({ id: 'draft', attachments: [] });
    mail.uploadAttachment.mockResolvedValue({
      id: 'upload',
      fileName: 'notes.txt',
      size: 4,
    });
  });
  it('renders the center composer inline and sends cc, bcc and attachments', async () => {
    const { container } = render(<MailSendPage />);
    const to = await screen.findByLabelText('TO');
    expect(container).toContainElement(to);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.change(to, { target: { value: 'recipient@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cc' }));
    fireEvent.click(screen.getByRole('button', { name: 'Bcc' }));
    fireEvent.change(screen.getByLabelText('CC'), {
      target: { value: 'copy@example.com' },
    });
    fireEvent.change(screen.getByLabelText('BCC'), {
      target: { value: 'hidden@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Subject'), {
      target: { value: 'Hello' },
    });
    const body = screen.getByRole('textbox', { name: 'Message body' });
    body.innerHTML = '<p>Message</p>';
    fireEvent.input(body);
    fireEvent.change(container.querySelector('input[type=file]')!, {
      target: {
        files: [new File(['data'], 'notes.txt', { type: 'text/plain' })],
      },
    });
    await screen.findByText('notes.txt');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() =>
      expect(mail.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          accountId: 'account',
          identityId: 'sender',
          to: [{ address: 'recipient@example.com' }],
          cc: [{ address: 'copy@example.com' }],
          bcc: [{ address: 'hidden@example.com' }],
          attachmentIds: ['upload'],
          subject: 'Hello',
        }),
      ),
    );
    expect(
      await screen.findByRole('button', { name: 'Compose' }),
    ).toBeVisible();
  });
  it('uses the same form for separate sending, deduplicating recipients and preserving content and schedule', async () => {
    render(<MailSendPage />);
    fireEvent.change(await screen.findByLabelText('TO'), {
      target: { value: 'alice@example.com;bob@example.com;ALICE@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Subject'), {
      target: { value: 'Update' },
    });
    const body = screen.getByRole('textbox', { name: 'Message body' });
    body.innerHTML = '<p>Shared body</p>';
    fireEvent.input(body);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Schedule send' }));
    fireEvent.change(screen.getByLabelText('Send later (optional)'), {
      target: { value: '2099-01-01T10:00' },
    });
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Send separately' }),
      ).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Send separately' }));
    await waitFor(() =>
      expect(mail.sendBulk).toHaveBeenCalledWith(
        expect.objectContaining({
          recipients: [
            { address: 'alice@example.com' },
            { address: 'bob@example.com' },
          ],
          subject: 'Update',
          text: 'Shared body',
          scheduledAt: new Date('2099-01-01T10:00').toISOString(),
        }),
      ),
    );
    expect(mail.sendMessage).not.toHaveBeenCalled();
    expect(mail.sendBulk.mock.calls[0][0]).not.toHaveProperty('draftMessageId');
  });

  it('sends saved draft attachments without sharing a consumable draft across recipients', async () => {
    mail.saveDraft.mockResolvedValue({
      id: 'draft',
      attachments: [
        {
          id: 'draft-attachment',
          messageId: 'draft',
          outboundAttachmentId: 'saved-upload',
          providerAttachmentId: 'provider-file',
          fileName: 'report.txt',
          contentType: 'text/plain',
          size: 4,
          inline: false,
        },
      ],
    });
    render(<MailSendPage />);
    fireEvent.change(await screen.findByLabelText('TO'), {
      target: { value: 'alice@example.com,bob@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Subject'), {
      target: { value: 'Update' },
    });
    const body = screen.getByRole('textbox', { name: 'Message body' });
    body.innerHTML = 'Body';
    fireEvent.input(body);
    await waitFor(() => expect(mail.saveDraft).toHaveBeenCalled(), {
      timeout: 3000,
    });
    await screen.findByText('report.txt');
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Send separately' }),
      ).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Send separately' }));
    await waitFor(() =>
      expect(mail.sendBulk).toHaveBeenCalledWith(
        expect.objectContaining({ attachmentIds: ['saved-upload'] }),
      ),
    );
    expect(mail.sendBulk.mock.calls[0][0]).not.toHaveProperty('draftMessageId');
    expect(mail.downloadAttachment).not.toHaveBeenCalled();
  });

  it('copies provider draft attachments before separate sending', async () => {
    mail.saveDraft.mockResolvedValue({
      id: 'draft',
      attachments: [
        {
          id: 'remote-file',
          messageId: 'draft',
          providerAttachmentId: 'provider-file',
          fileName: 'remote.txt',
          contentType: 'text/plain',
          size: 4,
          inline: false,
        },
      ],
    });
    mail.downloadAttachment.mockResolvedValue(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data'));
          controller.close();
        },
      }),
    );
    render(<MailSendPage />);
    fireEvent.change(await screen.findByLabelText('TO'), {
      target: { value: 'alice@example.com,bob@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Subject'), {
      target: { value: 'Update' },
    });
    const body = screen.getByRole('textbox', { name: 'Message body' });
    body.innerHTML = 'Body';
    fireEvent.input(body);
    await screen.findByText('remote.txt', {}, { timeout: 3000 });
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Send separately' }),
      ).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Send separately' }));
    await waitFor(() =>
      expect(mail.sendBulk).toHaveBeenCalledWith(
        expect.objectContaining({ attachmentIds: ['upload'] }),
      ),
    );
    expect(mail.downloadAttachment).toHaveBeenCalledWith(
      'account',
      'draft',
      'remote-file',
    );
    expect(mail.uploadAttachment).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'remote.txt', size: 4 }),
    );
  });

  it('preserves the form and reuses the batch key when retrying a failed request', async () => {
    mail.sendBulk.mockRejectedValueOnce(new Error('Offline'));
    render(<MailSendPage />);
    fireEvent.change(await screen.findByLabelText('TO'), {
      target: { value: 'alice@example.com,bob@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Subject'), {
      target: { value: 'Update' },
    });
    const body = screen.getByRole('textbox', { name: 'Message body' });
    body.innerHTML = 'Body';
    fireEvent.input(body);
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Send separately' }),
      ).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Send separately' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Offline');
    expect(screen.getByLabelText('Subject')).toHaveValue('Update');
    fireEvent.click(screen.getByRole('button', { name: 'Send separately' }));
    await waitFor(() => expect(mail.sendBulk).toHaveBeenCalledTimes(2));
    expect(mail.sendBulk.mock.calls[1][0]).toEqual(
      mail.sendBulk.mock.calls[0][0],
    );
  });

  it('does not silently discard Cc or Bcc when sending separately', async () => {
    render(<MailSendPage />);
    await screen.findByLabelText('TO');
    fireEvent.click(screen.getByRole('button', { name: 'Cc' }));
    fireEvent.change(screen.getByLabelText('CC'), {
      target: { value: 'copy@example.com' },
    });
    expect(
      screen.getByRole('button', { name: 'Send separately' }),
    ).toBeDisabled();
    expect(
      screen.getByText(
        'Separate sending does not support Cc or Bcc. Clear them to send separately.',
      ),
    ).toBeVisible();
    expect(mail.sendBulk).not.toHaveBeenCalled();
  });

  it('allows retrying account loading after an error', async () => {
    mail.listAccounts.mockRejectedValueOnce(new Error('Offline'));
    render(<MailSendPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Offline');
    fireEvent.click(screen.getByRole('button', { name: 'Reload accounts' }));
    expect(await screen.findByLabelText('TO')).toBeVisible();
  });
});
