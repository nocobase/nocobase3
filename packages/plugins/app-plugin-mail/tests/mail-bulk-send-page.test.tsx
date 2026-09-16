import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mail = vi.hoisted(() => ({
  listAccounts: vi.fn(),
  listIdentities: vi.fn(),
  listSignatures: vi.fn(),
  listTemplates: vi.fn(),
  sendBulk: vi.fn(),
  uploadAttachment: vi.fn(),
}));

vi.mock('../client/runtime.js', () => ({
  useMailClient: () => mail,
}));

import MailBulkSendPage from '../client/pages/mail-bulk-send-page.js';

describe('MailBulkSendPage', () => {
  beforeEach(() => {
    for (const mock of Object.values(mail)) mock.mockReset();
    mail.listAccounts.mockResolvedValue([
      {
        id: 'account-1',
        userId: 'user-1',
        provider: { type: 'test', name: 'test' },
        address: 'sender@example.com',
        status: 'active',
        scopes: [],
      },
    ]);
    mail.listIdentities.mockResolvedValue([
      {
        id: 'identity-1',
        accountId: 'account-1',
        address: 'sender@example.com',
        isPrimary: true,
        canSend: true,
      },
      {
        id: 'identity-2',
        accountId: 'account-1',
        address: 'alias@example.com',
        isPrimary: false,
        canSend: true,
      },
    ]);
    mail.listSignatures.mockResolvedValue([
      {
        id: 'signature-1',
        accountId: 'account-1',
        name: 'Default',
        text: 'Regards',
        isDefault: true,
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
      },
    ]);
    mail.listTemplates.mockResolvedValue([]);
    mail.uploadAttachment.mockResolvedValue({
      id: 'attachment-1',
      fileName: 'report.txt',
      contentType: 'text/plain',
      size: 10,
      expiresAt: '2026-09-15T00:00:00.000Z',
    });
  });

  it('parses, previews, submits and retries recipients independently', async () => {
    mail.sendBulk
      .mockResolvedValueOnce([
        { id: 'submission-1', accountId: 'account-1', status: 'accepted' },
        {
          id: 'submission-2',
          accountId: 'account-1',
          status: 'failed',
          error: {
            code: 'MAIL_PROVIDER_FAILED',
            category: 'provider',
            retryable: true,
          },
        },
      ])
      .mockResolvedValueOnce([
        { id: 'submission-3', accountId: 'account-1', status: 'accepted' },
      ]);

    render(<MailBulkSendPage />);

    await waitFor(() =>
      expect(mail.listIdentities).toHaveBeenCalledWith('account-1'),
    );
    const recipients = await screen.findByRole('textbox', {
      name: 'Recipients',
    });
    fireEvent.change(recipients, {
      target: {
        value:
          'alice@example.com, bob@example.com; alice@example.com\ninvalid-address',
      },
    });
    expect(screen.getByText('invalid-address')).toBeInTheDocument();
    fireEvent.change(recipients, {
      target: {
        value: 'alice@example.com, bob@example.com; alice@example.com',
      },
    });
    fireEvent.change(screen.getByLabelText('Subject'), {
      target: { value: 'Announcement' },
    });
    const body = screen.getByRole('textbox', { name: 'Message body' });
    body.innerHTML = 'Hello recipients';
    fireEvent.input(body);

    fireEvent.click(screen.getByRole('button', { name: 'Review recipients' }));
    expect(await screen.findByText('Review bulk send')).toBeInTheDocument();
    expect(screen.getByText('alice@example.com')).toBeInTheDocument();
    expect(screen.getByText('bob@example.com')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Confirm and send' }));
    await waitFor(() =>
      expect(mail.sendBulk).toHaveBeenCalledWith(
        expect.objectContaining({
          accountId: 'account-1',
          identityId: 'identity-1',
          signatureId: 'signature-1',
          recipients: [
            { address: 'alice@example.com' },
            { address: 'bob@example.com' },
          ],
          subject: 'Announcement',
          text: 'Hello recipients',
        }),
      ),
    );
    expect(await screen.findByText('Delivery results')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Retry failed' }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Retry failed' }));
    await waitFor(() => expect(mail.sendBulk).toHaveBeenCalledTimes(2));
    expect(mail.sendBulk).toHaveBeenLastCalledWith(
      expect.objectContaining({
        recipients: [{ address: 'bob@example.com' }],
      }),
    );
  });
});
