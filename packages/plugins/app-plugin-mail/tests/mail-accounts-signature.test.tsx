import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mail = vi.hoisted(() => ({
  getSyncRun: vi.fn(),
  listAccounts: vi.fn(),
  listIdentities: vi.fn(),
  listProviders: vi.fn(),
  listSignatures: vi.fn(),
  saveSignature: vi.fn(),
  deleteSignature: vi.fn(),
  removeAccount: vi.fn(),
  startAuthorization: vi.fn(),
  startSync: vi.fn(),
  updateAccount: vi.fn(),
}));

vi.mock('../client/runtime.js', () => ({ getMailClient: () => mail }));

import MailAccountsDevPage from '../client/pages/mail-accounts-dev-page.js';

describe('mail account signatures', () => {
  beforeEach(() => {
    for (const mock of Object.values(mail)) mock.mockReset();
    mail.listProviders.mockResolvedValue([]);
    mail.listAccounts.mockResolvedValue([
      {
        id: 'account-1',
        userId: 'user-1',
        provider: { type: 'gmail', name: 'google' },
        address: 'sender@example.com',
        scopes: [],
        status: 'active',
        isDefault: true,
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
    ]);
    mail.listSignatures.mockResolvedValue([]);
    mail.saveSignature.mockResolvedValue({
      id: 'signature-1',
      identityId: 'identity-1',
      name: 'Work',
      text: 'New signature',
      isDefault: true,
      createdAt: '2026-09-08T00:00:00.000Z',
      updatedAt: '2026-09-08T00:00:00.000Z',
    });
  });

  it('creates a named signature for an identity', async () => {
    render(<MailAccountsDevPage />);
    const name = await screen.findByLabelText('Signature name');
    const signature = await screen.findByLabelText(
      'Signature for sender@example.com',
    );
    fireEvent.change(name, { target: { value: 'Work' } });
    fireEvent.change(signature, { target: { value: 'New signature' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add signature' }));

    await waitFor(() =>
      expect(mail.saveSignature).toHaveBeenCalledWith({
        accountId: 'account-1',
        identityId: 'identity-1',
        name: 'Work',
        text: 'New signature',
        isDefault: true,
      }),
    );
  });
});
