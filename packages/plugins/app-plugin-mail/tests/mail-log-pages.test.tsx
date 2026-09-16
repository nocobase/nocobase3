import type { ReactElement } from 'react';
import { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider, NamespaceScope } from '@nocobase/i18n/client';
import locales from '../client/locales/index.js';
import { MAIL_PLUGIN_NS } from '../client/namespace.js';
import {
  fireEvent,
  render as renderComponent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mail = vi.hoisted(() => ({
  listAccounts: vi.fn(),
  listSubmissions: vi.fn(),
  listSyncRuns: vi.fn(),
  listManagedOperationLogs: vi.fn(),
  retrySyncRun: vi.fn(),
  cancelSyncRun: vi.fn(),
}));
vi.mock('../client/runtime.js', () => ({ useMailClient: () => mail }));
import MailSendLogsPage from '../client/pages/mail-send-logs-page.js';
import MailSyncLogsPage from '../client/pages/mail-sync-logs-page.js';
import MailOperationLogsPage from '../client/pages/mail-operation-logs-page.js';

const accounts = [
  {
    id: 'alice',
    userId: 'user-alice',
    address: 'alice@example.com',
    provider: { type: 'gmail', name: 'google' },
  },
  {
    id: 'bob',
    userId: 'user-bob',
    address: 'bob@example.com',
    provider: { type: 'imap-smtp', name: 'company' },
  },
];
const submissions = [
  'accepted',
  'failed',
  'unknown',
  'pending',
  'cancelled',
].map((status, index) => ({
  id: `send-${status}`,
  accountId: index === 0 ? 'alice' : 'deleted',
  status,
  providerMessageId: index === 0 ? 'remote-sent' : undefined,
  createdAt: '2026-09-10T12:00:00Z',
  updatedAt: 'invalid-time',
  error:
    status === 'failed'
      ? { code: 'SMTP_REJECTED', message: 'private-provider-details' }
      : undefined,
}));
const syncRuns = ['completed', 'failed', 'cancelled', 'pending', 'running'].map(
  (status, index) => ({
    id: `sync-${status}`,
    accountId: index === 0 ? 'alice' : 'bob',
    status,
    mode: index === 0 ? 'initial' : 'incremental',
    phase: 'incremental',
    processedMessages: 20,
    processedPages: 2,
    createdAt: '2026-09-10T12:00:00Z',
    completedAt: status === 'completed' ? '2026-09-10T13:00:00Z' : undefined,
    canManage: status !== 'cancelled',
    error:
      status === 'failed'
        ? { code: 'SYNC_FAILED', message: 'private-provider-details' }
        : undefined,
  }),
);

describe('mail log pages', () => {
  let runtime: I18nRuntime;
  const render = (element: ReactElement) =>
    renderComponent(
      <I18nProvider runtime={runtime}>
        <NamespaceScope ns={MAIL_PLUGIN_NS}>{element}</NamespaceScope>
      </I18nProvider>,
    );
  beforeEach(async () => {
    runtime = new I18nRuntime({ defaultLocale: 'en-US', locales: ['en-US'] });
    runtime.registerNamespace(MAIL_PLUGIN_NS, locales);
    await runtime.init();
    for (const mock of Object.values(mail)) mock.mockReset();
    mail.listAccounts.mockResolvedValue(accounts);
    mail.listSubmissions.mockResolvedValue(submissions);
    mail.listSyncRuns.mockResolvedValue(syncRuns);
    mail.listManagedOperationLogs.mockResolvedValue({
      accounts,
      submissions,
      syncRuns,
    });
    mail.retrySyncRun.mockResolvedValue(undefined);
    mail.cancelSyncRun.mockResolvedValue(undefined);
  });

  it('renders every delivery state and public error codes without exposing provider details', async () => {
    render(<MailSendLogsPage />);
    const table = within(await screen.findByRole('table'));
    for (const submission of submissions)
      expect(table.getByText(submission.id)).toBeVisible();
    expect(table.getByText('alice@example.com')).toBeVisible();
    expect(table.getAllByText('Unknown account')).toHaveLength(4);
    expect(table.getByText('remote-sent')).toBeVisible();
    expect(table.getByText('SMTP_REJECTED')).toBeVisible();
    expect(
      screen.queryByText('private-provider-details'),
    ).not.toBeInTheDocument();
    mail.listSubmissions.mockResolvedValue([]);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(await screen.findByText('No send logs')).toBeVisible();
  });

  it('renders sync progress and completion without exposing internal error text', async () => {
    render(<MailSyncLogsPage />);
    const table = within(await screen.findByRole('table'));
    expect(table.getAllByText('20 messages')).toHaveLength(5);
    expect(table.getAllByText('2 batches')).toHaveLength(5);
    expect(table.getByText('SYNC_FAILED')).toBeVisible();
    expect(
      screen.queryByText('private-provider-details'),
    ).not.toBeInTheDocument();
    mail.listSyncRuns.mockResolvedValue([]);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(await screen.findByText('No synchronization runs')).toBeVisible();
  });

  it.each([
    ['send', MailSendLogsPage, 'listSubmissions', 'No send logs'],
    ['sync', MailSyncLogsPage, 'listSyncRuns', 'No synchronization runs'],
    [
      'admin',
      MailOperationLogsPage,
      'listManagedOperationLogs',
      'No synchronization runs',
    ],
  ] as const)(
    'recovers the %s page after a failed request',
    async (_name, Page, method, emptyText) => {
      mail[method].mockRejectedValueOnce(new Error('Mail request failed.'));
      mail[method].mockResolvedValue(
        method === 'listManagedOperationLogs'
          ? { accounts: [], submissions: [], syncRuns: [] }
          : [],
      );
      render(<Page />);
      expect(await screen.findByText('Mail request failed.')).toBeVisible();
      fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
      await waitFor(() => expect(mail[method]).toHaveBeenCalledTimes(2));
      expect(await screen.findByText(emptyText)).toBeVisible();
      expect(
        screen.queryByText('Mail request failed.'),
      ).not.toBeInTheDocument();
    },
  );

  it('combines account, status, text and time filters and restores cleared results', async () => {
    render(<MailOperationLogsPage />);
    await screen.findByRole('table');
    fireEvent.change(screen.getByLabelText('Filter by account'), {
      target: { value: 'bob' },
    });
    fireEvent.change(screen.getByLabelText('Filter by status'), {
      target: { value: 'failed' },
    });
    fireEvent.change(screen.getByLabelText('Search operations'), {
      target: { value: ' COMPANY ' },
    });
    const table = within(screen.getByRole('table'));
    expect(table.getByText('SYNC_FAILED')).toBeVisible();
    expect(table.queryByText('user-alice')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Started after'), {
      target: { value: '2026-09-12T00:00' },
    });
    expect(screen.getByText('No synchronization runs')).toBeVisible();
    fireEvent.change(screen.getByLabelText('Started after'), {
      target: { value: '' },
    });
    fireEvent.change(screen.getByLabelText('Started before'), {
      target: { value: '2026-09-08T00:00' },
    });
    expect(screen.getByText('No synchronization runs')).toBeVisible();
    for (const label of [
      'Started before',
      'Filter by account',
      'Filter by status',
      'Search operations',
    ])
      fireEvent.change(screen.getByLabelText(label), { target: { value: '' } });
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(
      6,
    );
    fireEvent.click(screen.getByRole('tab', { name: /Sending/ }));
    expect(
      within(screen.getByRole('table')).getByText('send-accepted'),
    ).toBeVisible();
    fireEvent.change(screen.getByLabelText('Search operations'), {
      target: { value: 'send-unknown' },
    });
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(
      2,
    );
    expect(
      screen.queryByText('private-provider-details'),
    ).not.toBeInTheDocument();
  });

  it('offers actions only for manageable states and reloads logs after retry or cancellation', async () => {
    render(<MailOperationLogsPage />);
    await screen.findByRole('table');
    const row = (id: string) =>
      within(
        screen
          .getByText(
            id
              .slice('sync-'.length)
              .replace(/^./, (letter) => letter.toUpperCase()),
          )
          .closest('tr')!,
      );
    expect(row('sync-cancelled').queryByRole('button')).not.toBeInTheDocument();
    expect(row('sync-completed').queryByRole('button')).not.toBeInTheDocument();
    fireEvent.click(row('sync-failed').getByRole('button', { name: 'Retry' }));
    await waitFor(() =>
      expect(mail.listManagedOperationLogs).toHaveBeenCalledTimes(2),
    );
    expect(mail.retrySyncRun).toHaveBeenCalledWith('sync-failed');
    await screen.findByRole('table');
    fireEvent.click(
      row('sync-running').getByRole('button', { name: 'Cancel' }),
    );
    await waitFor(() =>
      expect(mail.listManagedOperationLogs).toHaveBeenCalledTimes(3),
    );
    expect(mail.cancelSyncRun).toHaveBeenCalledWith('sync-running');
    await screen.findByRole('table');
    mail.retrySyncRun.mockRejectedValueOnce(new Error('Mail request failed.'));
    fireEvent.click(row('sync-failed').getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Mail request failed.')).toBeVisible();
    expect(mail.listManagedOperationLogs).toHaveBeenCalledTimes(3);
    expect(screen.getByText('SYNC_FAILED')).toBeVisible();
  });
});
