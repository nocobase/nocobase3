import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mail = vi.hoisted(() => ({
  getSyncRun: vi.fn(),
  listAccounts: vi.fn(),
  listIdentities: vi.fn(),
  listProviders: vi.fn(),
  listSignatures: vi.fn(),
  listTemplates: vi.fn(),
  saveTemplate: vi.fn(),
  deleteTemplate: vi.fn(),
  saveSignature: vi.fn(),
  deleteSignature: vi.fn(),
  removeAccount: vi.fn(),
  startAuthorization: vi.fn(),
  startSync: vi.fn(),
  updateAccount: vi.fn(),
}));

vi.mock('../client/runtime.js', () => ({ getMailClient: () => mail }));

import MailAccountsDevPage from '../client/pages/mail-accounts-dev-page.js';

describe('mail account management', () => {
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
    mail.listTemplates.mockResolvedValue([]);
    mail.removeAccount.mockResolvedValue(undefined);
    mail.updateAccount.mockResolvedValue(undefined);
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
    fireEvent.click(await screen.findByRole('button', { name: 'Signatures' }));
    const signatureDrawer = await screen.findByRole('dialog', {
      name: 'Signature management',
    });
    expect(signatureDrawer).toBeVisible();
    expect(signatureDrawer).toHaveClass('fixed', 'inset-y-0', 'right-0');
    const name =
      await within(signatureDrawer).findByLabelText('Signature name');
    const signature = await within(signatureDrawer).findByLabelText(
      'Signature for sender@example.com',
    );
    fireEvent.change(name, { target: { value: 'Work' } });
    fireEvent.change(signature, { target: { value: 'New signature' } });
    fireEvent.click(
      within(signatureDrawer).getByRole('button', { name: 'Add signature' }),
    );

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

  it('keeps the connected account table as the default view', async () => {
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
          pushNotifications: false,
          folders: true,
          labels: false,
          drafts: false,
          moveMessage: false,
          aliases: false,
        },
      },
    ]);

    render(<MailAccountsDevPage />);

    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Associate account' }),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Deactivate' })).toBeVisible();
    expect(
      screen.queryByLabelText('Mail account type'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText('Import messages received after'),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Associate account' }));
    const accountDialog = await screen.findByRole('dialog', {
      name: 'Add mail account',
    });
    expect(accountDialog).toBeVisible();
    expect(accountDialog).toHaveClass('fixed', 'inset-y-0', 'right-0');
    expect(
      within(accountDialog).getByLabelText('Mail account type'),
    ).toBeVisible();
    expect(
      within(accountDialog).getByLabelText('Import messages received after'),
    ).toBeVisible();

    mail.startSync.mockResolvedValue({
      id: 'run-1',
      accountId: 'account-1',
      mode: 'initial',
      phase: 'folders',
      status: 'pending',
      policy: {
        receivedAfter: '2026-02-01T00:00:00.000Z',
        maxMessages: 10_000,
        batchSize: 100,
      },
      processedMessages: 0,
      processedPages: 0,
      createdAt: '2026-09-08T00:00:00.000Z',
      updatedAt: '2026-09-08T00:00:00.000Z',
    });
    fireEvent.change(screen.getByLabelText('Import messages received after'), {
      target: { value: '2026-02-01' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    const syncButton = screen.getByRole('button', { name: 'Sync' });
    expect(syncButton.querySelector('svg')).not.toBeInTheDocument();
    expect(syncButton.className).toBe(
      screen.getByRole('button', { name: 'Signatures' }).className,
    );
    fireEvent.click(syncButton);
    await waitFor(() =>
      expect(mail.startSync).toHaveBeenCalledWith({
        accountId: 'account-1',
        receivedAfter: '2026-02-01T00:00:00.000Z',
      }),
    );
  });

  it('opens template management from the account page', async () => {
    render(<MailAccountsDevPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Templates' }));

    const templateDialog = await screen.findByRole('dialog', {
      name: 'Template management',
    });
    expect(templateDialog).toBeVisible();
    expect(templateDialog).toHaveClass('fixed', 'inset-y-0', 'right-0');
    expect(
      within(templateDialog).getByLabelText('Template name'),
    ).toBeVisible();
  });

  it('requires confirmation before removing an account', async () => {
    render(<MailAccountsDevPage />);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Remove account' }),
    );

    const removeDialog = await screen.findByRole('dialog', {
      name: 'Remove mail account?',
    });
    expect(removeDialog).toBeVisible();
    expect(
      within(removeDialog).getByText(/delete synchronized mail/),
    ).toBeVisible();
    expect(mail.removeAccount).not.toHaveBeenCalled();

    fireEvent.click(
      within(removeDialog).getByRole('button', { name: 'Cancel' }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(mail.removeAccount).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Remove account' }));
    const reopenedDialog = await screen.findByRole('dialog', {
      name: 'Remove mail account?',
    });
    fireEvent.click(
      within(reopenedDialog).getByRole('button', { name: 'Remove account' }),
    );

    await waitFor(() =>
      expect(mail.removeAccount).toHaveBeenCalledWith('account-1'),
    );
  });
});
