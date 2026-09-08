import { RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { useTranslation } from '@nocobase/i18n/client';

import { MailPageHeader, MailStatusBadge } from '../components/index.js';
import { Button } from '../components/ui/button.js';
import { Card } from '../components/ui/card.js';
import { Input } from '../components/ui/input.js';
import { NativeSelect } from '../components/ui/native-select.js';
import {
  mailErrorMessage,
  type MailAccountView,
  type MailManagedOperationLogsView,
  type MailSubmissionLogView,
  type MailSyncRunView,
} from '../mail-client.js';
import { getMailClient } from '../runtime.js';

const mail = getMailClient();

type OperationLogTab = 'sync' | 'send';

const EMPTY_LOGS: MailManagedOperationLogsView = {
  accounts: [],
  syncRuns: [],
  submissions: [],
};

export default function MailOperationLogsPage(): ReactElement {
  const { t } = useTranslation();
  const [logs, setLogs] = useState<MailManagedOperationLogsView>(EMPTY_LOGS);
  const [activeTab, setActiveTab] = useState<OperationLogTab>('sync');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [accountFilter, setAccountFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [query, setQuery] = useState('');
  const [startedAfter, setStartedAfter] = useState('');
  const [startedBefore, setStartedBefore] = useState('');

  const refresh = useCallback((): void => {
    setLoading(true);
    setError(undefined);
    void mail
      .listManagedOperationLogs()
      .then(setLogs)
      .catch((cause: unknown) => {
        setError(
          mailErrorMessage(
            cause,
            t('errors.requestFailed', {
              defaultValue: 'Mail request failed.',
            }),
          ),
        );
      })
      .finally(() => setLoading(false));
  }, [t]);

  useEffect(() => {
    void Promise.resolve().then(refresh);
  }, [refresh]);

  const accountById = useMemo(
    () => new Map(logs.accounts.map((account) => [account.id, account])),
    [logs.accounts],
  );
  const filteredSyncRuns = useMemo(
    () =>
      logs.syncRuns.filter(
        (run) =>
          (!accountFilter || run.accountId === accountFilter) &&
          (!statusFilter || run.status === statusFilter) &&
          isWithinTimeRange(run.createdAt, startedAfter, startedBefore) &&
          matchesOperationQuery(run.id, accountById.get(run.accountId), query),
      ),
    [
      accountById,
      accountFilter,
      logs.syncRuns,
      query,
      startedAfter,
      startedBefore,
      statusFilter,
    ],
  );
  const filteredSubmissions = useMemo(
    () =>
      logs.submissions.filter(
        (submission) =>
          (!accountFilter || submission.accountId === accountFilter) &&
          (!statusFilter || submission.status === statusFilter) &&
          isWithinTimeRange(
            submission.createdAt,
            startedAfter,
            startedBefore,
          ) &&
          matchesOperationQuery(
            submission.id,
            accountById.get(submission.accountId),
            query,
          ),
      ),
    [
      accountById,
      accountFilter,
      logs.submissions,
      query,
      startedAfter,
      startedBefore,
      statusFilter,
    ],
  );

  const runAction = (operation: Promise<unknown>): void => {
    setLoading(true);
    setError(undefined);
    void operation.then(refresh).catch((cause: unknown) => {
      setLoading(false);
      setError(
        mailErrorMessage(
          cause,
          t('errors.requestFailed', { defaultValue: 'Mail request failed.' }),
        ),
      );
    });
  };

  return (
    <section className='min-h-[calc(100svh-4rem)] bg-muted/20'>
      <MailPageHeader
        actions={
          <Button disabled={loading} onClick={refresh} variant='outline'>
            <RefreshCw
              aria-hidden='true'
              className={`size-4 ${loading ? 'animate-spin' : ''}`}
            />
            {t('actions.refresh', { defaultValue: 'Refresh' })}
          </Button>
        }
        description={t('settings.operationLogs.description', {
          defaultValue:
            'Review synchronization and delivery operations across every connected user account.',
        })}
        eyebrow={t('settings.operationLogs.eyebrow', {
          defaultValue: 'Mail administration',
        })}
        title={t('settings.operationLogs.title', {
          defaultValue: 'Operation logs',
        })}
      />

      <div className='mx-auto w-full max-w-7xl space-y-6 px-6 py-6'>
        {error ? (
          <div className='rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive'>
            {error}
          </div>
        ) : null}

        <div className='grid gap-4 sm:grid-cols-3'>
          <SummaryCard
            label={t('settings.operationLogs.accounts', {
              defaultValue: 'Connected accounts',
            })}
            value={logs.accounts.length}
          />
          <SummaryCard
            label={t('settings.operationLogs.syncOperations', {
              defaultValue: 'Sync operations',
            })}
            value={logs.syncRuns.length}
          />
          <SummaryCard
            label={t('settings.operationLogs.sendOperations', {
              defaultValue: 'Send operations',
            })}
            value={logs.submissions.length}
          />
        </div>

        <Card className='overflow-hidden bg-background shadow-sm'>
          <div className='grid gap-3 border-b p-4 sm:grid-cols-2 xl:grid-cols-5'>
            <Input
              aria-label={t('settings.operationLogs.search', {
                defaultValue: 'Search operations',
              })}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('settings.operationLogs.search', {
                defaultValue: 'Search operations',
              })}
              value={query}
            />
            <NativeSelect
              aria-label={t('settings.operationLogs.accountFilter', {
                defaultValue: 'Filter by account',
              })}
              onChange={(event) => setAccountFilter(event.target.value)}
              value={accountFilter}
            >
              <option value=''>
                {t('settings.operationLogs.allAccounts', {
                  defaultValue: 'All accounts',
                })}
              </option>
              {logs.accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.address}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect
              aria-label={t('settings.operationLogs.statusFilter', {
                defaultValue: 'Filter by status',
              })}
              onChange={(event) => setStatusFilter(event.target.value)}
              value={statusFilter}
            >
              <option value=''>
                {t('settings.operationLogs.allStatuses', {
                  defaultValue: 'All statuses',
                })}
              </option>
              {[
                'pending',
                'running',
                'completed',
                'accepted',
                'failed',
                'unknown',
                'cancelled',
              ].map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </NativeSelect>
            <Input
              aria-label={t('settings.operationLogs.startedAfter', {
                defaultValue: 'Started after',
              })}
              onChange={(event) => setStartedAfter(event.target.value)}
              title={t('settings.operationLogs.startedAfter', {
                defaultValue: 'Started after',
              })}
              type='datetime-local'
              value={startedAfter}
            />
            <Input
              aria-label={t('settings.operationLogs.startedBefore', {
                defaultValue: 'Started before',
              })}
              onChange={(event) => setStartedBefore(event.target.value)}
              title={t('settings.operationLogs.startedBefore', {
                defaultValue: 'Started before',
              })}
              type='datetime-local'
              value={startedBefore}
            />
          </div>
          <div
            aria-label={t('settings.operationLogs.type', {
              defaultValue: 'Operation type',
            })}
            className='flex gap-1 border-b bg-muted/20 px-4 pt-3'
            role='tablist'
          >
            <LogTab
              active={activeTab === 'sync'}
              count={logs.syncRuns.length}
              label={t('settings.operationLogs.syncTab', {
                defaultValue: 'Synchronization',
              })}
              onClick={() => setActiveTab('sync')}
            />
            <LogTab
              active={activeTab === 'send'}
              count={logs.submissions.length}
              label={t('settings.operationLogs.sendTab', {
                defaultValue: 'Sending',
              })}
              onClick={() => setActiveTab('send')}
            />
          </div>

          {loading ? (
            <div className='p-10 text-center text-sm text-muted-foreground'>
              {t('settings.operationLogs.loading', {
                defaultValue: 'Loading operation logs…',
              })}
            </div>
          ) : activeTab === 'sync' ? (
            <SyncLogsTable
              accountById={accountById}
              onCancel={(run) => runAction(mail.cancelSyncRun(run.id))}
              onRetry={(run) => runAction(mail.retrySyncRun(run.id))}
              runs={filteredSyncRuns}
            />
          ) : (
            <SendLogsTable
              accountById={accountById}
              submissions={filteredSubmissions}
            />
          )}
        </Card>
      </div>
    </section>
  );
}

function SummaryCard({
  label,
  value,
}: {
  readonly label: string;
  readonly value: number;
}): ReactElement {
  return (
    <Card className='bg-background p-5 shadow-sm'>
      <p className='text-sm text-muted-foreground'>{label}</p>
      <p className='mt-2 text-2xl font-semibold tracking-tight'>{value}</p>
    </Card>
  );
}

function LogTab({
  active,
  count,
  label,
  onClick,
}: {
  readonly active: boolean;
  readonly count: number;
  readonly label: string;
  readonly onClick: () => void;
}): ReactElement {
  return (
    <button
      aria-selected={active}
      className={`relative flex items-center gap-2 px-3 py-3 text-sm font-medium transition-colors ${active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
      onClick={onClick}
      role='tab'
      type='button'
    >
      {label}
      <span className='rounded-full bg-muted px-2 py-0.5 text-xs'>{count}</span>
      {active ? (
        <span className='absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary' />
      ) : null}
    </button>
  );
}

function SyncLogsTable({
  accountById,
  onCancel,
  onRetry,
  runs,
}: {
  readonly accountById: ReadonlyMap<string, MailAccountView>;
  readonly onCancel: (run: MailSyncRunView) => void;
  readonly onRetry: (run: MailSyncRunView) => void;
  readonly runs: readonly MailSyncRunView[];
}): ReactElement {
  const { t } = useTranslation();
  if (runs.length === 0) {
    return (
      <EmptyState
        description={t('settings.syncLogs.emptyDescription', {
          defaultValue: 'Start a mailbox synchronization to create a log.',
        })}
        title={t('settings.syncLogs.emptyTitle', {
          defaultValue: 'No synchronization runs',
        })}
      />
    );
  }
  return (
    <div className='overflow-x-auto'>
      <table className='w-full min-w-[1120px] text-sm'>
        <thead className='border-b bg-muted/40 text-left text-xs text-muted-foreground'>
          <tr>
            <Header label={t('settings.operationLogs.user')} />
            <Header label={t('settings.syncLogs.account')} />
            <Header
              className='min-w-28 whitespace-nowrap'
              label={t('settings.syncLogs.mode')}
            />
            <Header
              className='min-w-24 whitespace-nowrap'
              label={t('settings.syncLogs.status')}
            />
            <Header label={t('settings.syncLogs.phase')} />
            <Header label={t('settings.syncLogs.progress')} />
            <Header label={t('settings.syncLogs.startedAt')} />
            <Header label={t('settings.syncLogs.completedAt')} />
            <Header label={t('settings.syncLogs.error')} />
            <Header label={t('settings.operationLogs.actions')} />
          </tr>
        </thead>
        <tbody className='divide-y'>
          {runs.map((run) => {
            const account = accountById.get(run.accountId);
            return (
              <tr className='align-top hover:bg-muted/20' key={run.id}>
                <Cell>{account?.userId ?? '—'}</Cell>
                <AccountCell account={account} />
                <Cell className='min-w-28 whitespace-nowrap'>
                  {t(`settings.syncLogs.${run.mode}`, {
                    defaultValue: run.mode,
                  })}
                </Cell>
                <td className='min-w-24 whitespace-nowrap px-4 py-3'>
                  <MailStatusBadge
                    label={t(`status.sync.${run.status}`, {
                      defaultValue: run.status,
                    })}
                    tone={syncStatusTone(run.status)}
                  />
                </td>
                <Cell>{run.phase}</Cell>
                <td className='px-4 py-3'>
                  <div>
                    {t('settings.syncLogs.messages', {
                      count: run.processedMessages,
                      defaultValue: '{{count}} messages',
                    })}
                  </div>
                  <div className='text-xs text-muted-foreground'>
                    {t('settings.syncLogs.batches', {
                      count: run.processedPages,
                      defaultValue: '{{count}} batches',
                    })}
                  </div>
                </td>
                <Cell>{formatTimestamp(run.createdAt)}</Cell>
                <Cell>
                  {run.completedAt ? formatTimestamp(run.completedAt) : '—'}
                </Cell>
                <ErrorCell code={run.error?.code} />
                <td className='px-4 py-3'>
                  {run.canManage &&
                  ['failed', 'cancelled'].includes(run.status) ? (
                    <Button onClick={() => onRetry(run)} variant='outline'>
                      {t('settings.operationLogs.retry', {
                        defaultValue: 'Retry',
                      })}
                    </Button>
                  ) : run.canManage &&
                    ['pending', 'running'].includes(run.status) ? (
                    <Button onClick={() => onCancel(run)} variant='outline'>
                      {t('settings.operationLogs.cancel', {
                        defaultValue: 'Cancel',
                      })}
                    </Button>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SendLogsTable({
  accountById,
  submissions,
}: {
  readonly accountById: ReadonlyMap<string, MailAccountView>;
  readonly submissions: readonly MailSubmissionLogView[];
}): ReactElement {
  const { t } = useTranslation();
  if (submissions.length === 0) {
    return (
      <EmptyState
        description={t('settings.sendLogs.emptyDescription', {
          defaultValue: 'Submitted messages will create delivery records here.',
        })}
        title={t('settings.sendLogs.emptyTitle', {
          defaultValue: 'No send logs',
        })}
      />
    );
  }
  return (
    <div className='overflow-x-auto'>
      <table className='w-full min-w-[1080px] text-sm'>
        <thead className='border-b bg-muted/40 text-left text-xs text-muted-foreground'>
          <tr>
            <Header label={t('settings.operationLogs.user')} />
            <Header label={t('settings.sendLogs.account')} />
            <Header label={t('settings.sendLogs.status')} />
            <Header label={t('settings.sendLogs.submissionId')} />
            <Header label={t('settings.sendLogs.providerMessageId')} />
            <Header label={t('settings.sendLogs.createdAt')} />
            <Header label={t('settings.sendLogs.updatedAt')} />
            <Header label={t('settings.sendLogs.error')} />
          </tr>
        </thead>
        <tbody className='divide-y'>
          {submissions.map((submission) => {
            const account = accountById.get(submission.accountId);
            return (
              <tr className='align-top hover:bg-muted/20' key={submission.id}>
                <Cell>{account?.userId ?? '—'}</Cell>
                <AccountCell account={account} />
                <td className='px-4 py-3'>
                  <MailStatusBadge
                    label={t(`status.submission.${submission.status}`, {
                      defaultValue: submission.status,
                    })}
                    tone={submissionStatusTone(submission.status)}
                  />
                </td>
                <CodeCell value={submission.id} />
                <CodeCell value={submission.providerMessageId} />
                <Cell>{formatTimestamp(submission.createdAt)}</Cell>
                <Cell>{formatTimestamp(submission.updatedAt)}</Cell>
                <ErrorCell code={submission.error?.code} />
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Header({
  className,
  label,
}: {
  readonly className?: string;
  readonly label: string;
}): ReactElement {
  return (
    <th className={`px-4 py-3 font-medium ${className ?? ''}`}>{label}</th>
  );
}

function Cell({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}): ReactElement {
  return (
    <td className={`px-4 py-3 text-muted-foreground ${className ?? ''}`}>
      {children}
    </td>
  );
}

function AccountCell({
  account,
}: {
  readonly account: MailAccountView | undefined;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <td className='px-4 py-3'>
      <p className='font-medium'>
        {account?.address ??
          t('settings.operationLogs.unknownAccount', {
            defaultValue: 'Unknown account',
          })}
      </p>
      {account ? (
        <p className='mt-0.5 text-xs text-muted-foreground'>
          {account.provider.type} / {account.provider.name}
        </p>
      ) : null}
    </td>
  );
}

function CodeCell({
  value,
}: {
  readonly value: string | undefined;
}): ReactElement {
  return (
    <td className='max-w-56 break-all px-4 py-3 font-mono text-xs text-muted-foreground'>
      {value ?? '—'}
    </td>
  );
}

function ErrorCell({
  code,
}: {
  readonly code: string | undefined;
}): ReactElement {
  return (
    <td className='max-w-64 px-4 py-3 text-xs text-destructive'>
      {code ?? '—'}
    </td>
  );
}

function EmptyState({
  description,
  title,
}: {
  readonly description: string;
  readonly title: string;
}): ReactElement {
  return (
    <div className='p-10 text-center'>
      <p className='font-medium'>{title}</p>
      <p className='mt-1 text-sm text-muted-foreground'>{description}</p>
    </div>
  );
}

function syncStatusTone(
  status: MailSyncRunView['status'],
): 'success' | 'danger' | 'info' {
  if (status === 'completed') return 'success';
  if (status === 'failed' || status === 'cancelled') return 'danger';
  return 'info';
}

function submissionStatusTone(
  status: MailSubmissionLogView['status'],
): 'success' | 'danger' | 'info' {
  if (status === 'accepted') return 'success';
  if (status === 'failed' || status === 'unknown') return 'danger';
  return 'info';
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function matchesOperationQuery(
  id: string,
  account: MailAccountView | undefined,
  query: string,
): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [id, account?.address, account?.userId, account?.provider.name]
    .filter((value): value is string => Boolean(value))
    .some((value) => value.toLowerCase().includes(needle));
}

function isWithinTimeRange(
  value: string,
  startedAfter: string,
  startedBefore: string,
): boolean {
  const timestamp = new Date(value).getTime();
  const after = startedAfter ? new Date(startedAfter).getTime() : undefined;
  const before = startedBefore ? new Date(startedBefore).getTime() : undefined;
  return (
    (after === undefined || timestamp >= after) &&
    (before === undefined || timestamp <= before)
  );
}
