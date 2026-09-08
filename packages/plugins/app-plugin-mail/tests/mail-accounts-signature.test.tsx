import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mail = vi.hoisted(() => ({
  getSyncRun: vi.fn(),
  listAccounts: vi.fn(),
  listIdentities: vi.fn(),
  listProviders: vi.fn(),
  removeAccount: vi.fn(),
  startAuthorization: vi.fn(),
  startSync: vi.fn(),
  updateAccount: vi.fn(),
  updateIdentity: vi.fn(),
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
        signatureText: 'Old signature',
      },
    ]);
    mail.updateIdentity.mockResolvedValue({
      id: 'identity-1',
      accountId: 'account-1',
      address: 'sender@example.com',
      isPrimary: true,
      canSend: true,
      signatureText: 'New signature',
    });
  });

  it('edits and saves an identity signature', async () => {
    render(<MailAccountsDevPage />);
    const signature = await screen.findByLabelText(
      'Signature for sender@example.com',
    );
    expect(signature).toHaveValue('Old signature');
    fireEvent.change(signature, { target: { value: 'New signature' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save signature' }));

    await waitFor(() =>
      expect(mail.updateIdentity).toHaveBeenCalledWith({
        accountId: 'account-1',
        identityId: 'identity-1',
        signatureText: 'New signature',
        signatureHtml: null,
      }),
    );
  });
});
