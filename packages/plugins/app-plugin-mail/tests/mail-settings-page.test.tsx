import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mail = vi.hoisted(() => ({
  listManagedAccounts: vi.fn(),
}));

vi.mock('../client/runtime.js', () => ({ useMailClient: () => mail }));

import MailSettingsPage from '../client/pages/mail-settings-page.js';

describe('mail settings page', () => {
  beforeEach(() => {
    mail.listManagedAccounts.mockReset();
  });

  it('renders managed accounts in a table with owner and sync metadata', async () => {
    mail.listManagedAccounts.mockResolvedValue([
      {
        id: 'account-1',
        userId: 'user-1',
        provider: { type: 'gmail', name: 'google' },
        address: 'sender@example.com',
        displayName: 'Support inbox',
        scopes: [],
        status: 'active',
        initialSyncReceivedAfter: '2026-01-15T00:00:00.000Z',
        canSync: true,
      },
    ]);

    render(<MailSettingsPage />);

    const table = await screen.findByRole('table');
    expect(table).toBeVisible();
    expect(
      within(table).getByRole('columnheader', { name: 'Account' }),
    ).toBeVisible();
    expect(
      within(table).getByRole('columnheader', { name: 'Owner' }),
    ).toBeVisible();
    expect(within(table).getByText('sender@example.com')).toBeVisible();
    expect(within(table).getByText('Support inbox')).toBeVisible();
    expect(within(table).getByText(/User ID:/)).toBeVisible();
    expect(within(table).getByText('2026-01-15')).toBeVisible();
  });
});
