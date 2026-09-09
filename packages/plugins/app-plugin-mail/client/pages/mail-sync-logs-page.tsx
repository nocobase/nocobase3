import { RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { useTranslation } from '@nocobase/i18n/client';

import { MailDevPageShell, MailStatusBadge } from '../components/index.js';
import { Button } from '../components/ui/button.js';
import { Card } from '../components/ui/card.js';
import {
  mailErrorMessage,
  type MailAccountView,
  type MailSyncRunView,
} from '../mail-client.js';
import { getMailClient } from '../runtime.js';

const mail = getMailClient();

export default function MailSyncLogsPage(): ReactElement {
  const { t } = useTranslation();
  const [accounts, setAccounts] = useState<readonly MailAccountView[]>([]);
  const [runs, setRuns] = useState<readonly MailSyncRunView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  const refresh = useCallback((): void => {
    setLoading(true);
    setError(undefined);
    void Promise.all([mail.listAccounts(), mail.listSyncRuns()])
      .then(([nextAccounts, nextRuns]) => {
        setAccounts(nextAccounts);
        setRuns(nextRuns);
      })
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

  const accountLabels = useMemo(
    () => new Map(accounts.map((account) => [account.id, account.address])),
    [accounts],
  );

  return (
    <MailDevPageShell
      actions={
        <Button disabled={loading} onClick={refresh} variant='outline'>
          <RefreshCw
            aria-hidden='true'
            className={`size-4 ${loading ? 'animate-spin' : ''}`}
          />
          {t('actions.refresh', { defaultValue: 'Refresh' })}
        </Button>
      }
      badge={t('nav.dev', { defaultValue: 'Mail components' })}
      category={t('dev.syncLogsCategory', {
        defaultValue: 'Runtime history',
      })}
      description={t('settings.syncLogs.description', {
        defaultValue:
          'Review recent initial and incremental mailbox synchronization runs.',
      })}
      title={t('settings.syncLogs.title', { defaultValue: 'Sync logs' })}
    >
      <div className='space-y-5 pb-12'>
        {error ? (
          <div className='rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive'>
            {error}
          </div>
        ) : null}

        <Card className='overflow-hidden rounded-2xl bg-background shadow-sm'>
          {loading ? (
            <div className='p-8 text-center text-sm text-muted-foreground'>
              {t('settings.loading', {
                defaultValue: 'Loading mail configuration…',
              })}
            </div>
          ) : runs.length === 0 ? (
            <div className='p-10 text-center'>
              <p className='font-medium'>
                {t('settings.syncLogs.emptyTitle', {
                  defaultValue: 'No synchronization runs',
                })}
              </p>
              <p className='mt-1 text-sm text-muted-foreground'>
                {t('settings.syncLogs.emptyDescription', {
                  defaultValue:
                    'Start a mailbox synchronization to create a log.',
                })}
              </p>
            </div>
          ) : (
            <div className='overflow-x-auto'>
              <table className='w-full min-w-[980px] text-sm'>
                <thead className='border-b bg-muted/50 text-left text-xs text-muted-foreground'>
                  <tr>
                    <th className='px-4 py-3 font-medium'>
                      {t('settings.syncLogs.account', {
                        defaultValue: 'Account',
                      })}
                    </th>
                    <th className='px-4 py-3 font-medium'>
                      {t('settings.syncLogs.mode', { defaultValue: 'Mode' })}
                    </th>
                    <th className='px-4 py-3 font-medium'>
                      {t('settings.syncLogs.status', {
                        defaultValue: 'Status',
                      })}
                    </th>
                    <th className='px-4 py-3 font-medium'>
                      {t('settings.syncLogs.phase', { defaultValue: 'Phase' })}
                    </th>
                    <th className='px-4 py-3 font-medium'>
                      {t('settings.syncLogs.progress', {
                        defaultValue: 'Progress',
                      })}
                    </th>
                    <th className='px-4 py-3 font-medium'>
                      {t('settings.syncLogs.startedAt', {
                        defaultValue: 'Started at',
                      })}
                    </th>
                    <th className='px-4 py-3 font-medium'>
                      {t('settings.syncLogs.completedAt', {
                        defaultValue: 'Completed at',
                      })}
                    </th>
                    <th className='px-4 py-3 font-medium'>
                      {t('settings.syncLogs.error', { defaultValue: 'Error' })}
                    </th>
                  </tr>
                </thead>
                <tbody className='divide-y'>
                  {runs.map((run) => (
                    <tr className='align-top' key={run.id}>
                      <td className='px-4 py-3 font-medium'>
                        {accountLabels.get(run.accountId) ??
                          t('settings.syncLogs.unknownAccount', {
                            defaultValue: 'Unknown account',
                          })}
                      </td>
                      <td className='px-4 py-3'>
                        {t(`settings.syncLogs.${run.mode}`, {
                          defaultValue: run.mode,
                        })}
                      </td>
                      <td className='px-4 py-3'>
                        <MailStatusBadge
                          label={t(`status.sync.${run.status}`, {
                            defaultValue: run.status,
                          })}
                          tone={syncStatusTone(run.status)}
                        />
                      </td>
                      <td className='px-4 py-3 text-muted-foreground'>
                        {run.phase}
                      </td>
                      <td className='px-4 py-3'>
                        <div>
                          {t('settings.syncLogs.messages', {
                            defaultValue: '{{count}} messages',
                            count: run.processedMessages,
                          })}
                        </div>
                        <div className='text-xs text-muted-foreground'>
                          {t('settings.syncLogs.batches', {
                            defaultValue: '{{count}} batches',
                            count: run.processedPages,
                          })}
                        </div>
                      </td>
                      <td className='px-4 py-3 text-muted-foreground'>
                        {formatTimestamp(run.createdAt)}
                      </td>
                      <td className='px-4 py-3 text-muted-foreground'>
                        {run.completedAt
                          ? formatTimestamp(run.completedAt)
                          : t('settings.syncLogs.notCompleted', {
                              defaultValue: '—',
                            })}
                      </td>
                      <td className='max-w-64 px-4 py-3 text-xs text-destructive'>
                        {run.error?.code ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </MailDevPageShell>
  );
}

function syncStatusTone(
  status: MailSyncRunView['status'],
): 'success' | 'danger' | 'info' {
  if (status === 'completed') return 'success';
  if (status === 'failed' || status === 'cancelled') return 'danger';
  return 'info';
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}
