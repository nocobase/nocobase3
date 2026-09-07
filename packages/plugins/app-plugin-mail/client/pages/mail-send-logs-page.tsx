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
  type MailSubmissionLogView,
} from '../mail-client.js';
import { getMailClient } from '../runtime.js';

const mail = getMailClient();

export default function MailSendLogsPage(): ReactElement {
  const { t } = useTranslation();
  const [accounts, setAccounts] = useState<readonly MailAccountView[]>([]);
  const [submissions, setSubmissions] = useState<
    readonly MailSubmissionLogView[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  const refresh = useCallback((): void => {
    setLoading(true);
    setError(undefined);
    void Promise.all([mail.listAccounts(), mail.listSubmissions()])
      .then(([nextAccounts, nextSubmissions]) => {
        setAccounts(nextAccounts);
        setSubmissions(nextSubmissions);
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
      category={t('dev.sendLogsCategory', {
        defaultValue: 'Delivery history',
      })}
      description={t('settings.sendLogs.description', {
        defaultValue: 'Review recent mail delivery submissions and results.',
      })}
      title={t('settings.sendLogs.title', { defaultValue: 'Send logs' })}
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
          ) : submissions.length === 0 ? (
            <div className='p-10 text-center'>
              <p className='font-medium'>
                {t('settings.sendLogs.emptyTitle', {
                  defaultValue: 'No send logs',
                })}
              </p>
              <p className='mt-1 text-sm text-muted-foreground'>
                {t('settings.sendLogs.emptyDescription', {
                  defaultValue:
                    'Submitted messages will create delivery records here.',
                })}
              </p>
            </div>
          ) : (
            <div className='overflow-x-auto'>
              <table className='w-full min-w-[900px] text-sm'>
                <thead className='border-b bg-muted/50 text-left text-xs text-muted-foreground'>
                  <tr>
                    <th className='px-4 py-3 font-medium'>
                      {t('settings.sendLogs.account', {
                        defaultValue: 'Account',
                      })}
                    </th>
                    <th className='px-4 py-3 font-medium'>
                      {t('settings.sendLogs.status', {
                        defaultValue: 'Status',
                      })}
                    </th>
                    <th className='px-4 py-3 font-medium'>
                      {t('settings.sendLogs.submissionId', {
                        defaultValue: 'Submission ID',
                      })}
                    </th>
                    <th className='px-4 py-3 font-medium'>
                      {t('settings.sendLogs.providerMessageId', {
                        defaultValue: 'Provider message ID',
                      })}
                    </th>
                    <th className='px-4 py-3 font-medium'>
                      {t('settings.sendLogs.createdAt', {
                        defaultValue: 'Created at',
                      })}
                    </th>
                    <th className='px-4 py-3 font-medium'>
                      {t('settings.sendLogs.updatedAt', {
                        defaultValue: 'Updated at',
                      })}
                    </th>
                    <th className='px-4 py-3 font-medium'>
                      {t('settings.sendLogs.error', { defaultValue: 'Error' })}
                    </th>
                  </tr>
                </thead>
                <tbody className='divide-y'>
                  {submissions.map((submission) => (
                    <tr className='align-top' key={submission.id}>
                      <td className='px-4 py-3 font-medium'>
                        {accountLabels.get(submission.accountId) ??
                          t('settings.sendLogs.unknownAccount', {
                            defaultValue: 'Unknown account',
                          })}
                      </td>
                      <td className='px-4 py-3'>
                        <MailStatusBadge
                          label={t(`status.submission.${submission.status}`, {
                            defaultValue: submission.status,
                          })}
                          tone={submissionStatusTone(submission.status)}
                        />
                      </td>
                      <td className='max-w-56 break-all px-4 py-3 text-xs text-muted-foreground'>
                        {submission.id}
                      </td>
                      <td className='max-w-56 break-all px-4 py-3 text-xs text-muted-foreground'>
                        {submission.providerMessageId ?? '—'}
                      </td>
                      <td className='px-4 py-3 text-muted-foreground'>
                        {formatTimestamp(submission.createdAt)}
                      </td>
                      <td className='px-4 py-3 text-muted-foreground'>
                        {formatTimestamp(submission.updatedAt)}
                      </td>
                      <td className='max-w-64 px-4 py-3 text-xs text-destructive'>
                        {submission.error?.code ?? '—'}
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
