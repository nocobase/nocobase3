import { Inbox, RefreshCw, Send } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { useTranslation } from '@nocobase/i18n/client';

import {
  MailPageHeader,
  MailStatusBadge,
  MailSyncPolicyFields,
  type MailSyncPolicyValue,
} from '../components/index.js';
import {
  mailErrorMessage,
  type MailAccountView,
  type MailIdentity,
  type MailMessageSummary,
  type MailSubmissionView,
  type MailSyncMode,
  type MailSyncRunView,
} from '../mail-client.js';
import { getMailClient } from '../runtime.js';
import { Button } from '../components/ui/button.js';
import { Card } from '../components/ui/card.js';
import { Input } from '../components/ui/input.js';
import { NativeSelect } from '../components/ui/native-select.js';
import { Textarea } from '../components/ui/textarea.js';

const mail = getMailClient();
interface ComposeValue {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
}

export default function MailDevPage(): ReactElement {
  const { t } = useTranslation();
  const [accounts, setAccounts] = useState<readonly MailAccountView[]>([]);
  const [accountId, setAccountId] = useState('');
  const [identities, setIdentities] = useState<readonly MailIdentity[]>([]);
  const [identityId, setIdentityId] = useState('');
  const [messages, setMessages] = useState<readonly MailMessageSummary[]>([]);
  const [compose, setCompose] = useState<ComposeValue>({
    to: '',
    subject: '',
    text: '',
  });
  const [policy, setPolicy] = useState<MailSyncPolicyValue>(() => ({
    receivedAfter: dateDaysAgo(30),
    maxMessages: 1_000,
    batchSize: 100,
  }));
  const [syncMode, setSyncMode] = useState<MailSyncMode>('initial');
  const [syncRun, setSyncRun] = useState<MailSyncRunView>();
  const [submission, setSubmission] = useState<MailSubmissionView>();
  const [busy, setBusy] = useState<'loading' | 'sending' | 'syncing'>();
  const [error, setError] = useState<string>();

  const selectedAccount = useMemo(
    () => accounts.find((account) => account.id === accountId),
    [accountId, accounts],
  );

  const loadAccounts = useCallback((): void => {
    setBusy('loading');
    setError(undefined);
    void mail
      .listAccounts()
      .then((nextAccounts) => {
        setAccounts(nextAccounts);
        setAccountId((current) =>
          nextAccounts.some((account) => account.id === current)
            ? current
            : (nextAccounts[0]?.id ?? ''),
        );
        if (nextAccounts.length === 0) {
          setIdentities([]);
          setIdentityId('');
          setMessages([]);
        }
      })
      .catch((cause: unknown) =>
        setError(
          mailErrorMessage(
            cause,
            t('errors.requestFailed', { defaultValue: 'Mail request failed.' }),
          ),
        ),
      )
      .finally(() => setBusy(undefined));
  }, [t]);

  useEffect(() => {
    void Promise.resolve().then(loadAccounts);
  }, [loadAccounts]);

  useEffect(() => {
    if (!accountId) {
      return;
    }
    let active = true;
    void Promise.all([
      mail.listIdentities(accountId),
      mail.listMessages({ accountId, limit: 20 }),
    ]).then(
      ([nextIdentities, page]) => {
        if (!active) return;
        setIdentities(nextIdentities);
        setIdentityId(
          nextIdentities.find((identity) => identity.isPrimary)?.id ??
            nextIdentities[0]?.id ??
            '',
        );
        setMessages(page.items);
      },
      (cause: unknown) => {
        if (active)
          setError(
            mailErrorMessage(
              cause,
              t('errors.requestFailed', {
                defaultValue: 'Mail request failed.',
              }),
            ),
          );
      },
    );
    return () => {
      active = false;
    };
  }, [accountId, t]);

  useEffect(() => {
    if (!syncRun || !['pending', 'running'].includes(syncRun.status)) {
      return undefined;
    }
    const timer = window.setInterval(() => {
      void mail.getSyncRun(syncRun.id).then(
        (nextRun) => {
          setSyncRun(nextRun);
          if (!['pending', 'running'].includes(nextRun.status)) {
            setBusy(undefined);
            void mail
              .listMessages({ accountId: nextRun.accountId, limit: 20 })
              .then((page) => setMessages(page.items));
          }
        },
        (cause: unknown) => {
          setError(
            mailErrorMessage(
              cause,
              t('errors.requestFailed', {
                defaultValue: 'Mail request failed.',
              }),
            ),
          );
          setBusy(undefined);
          setSyncRun(undefined);
        },
      );
    }, 1500);
    return () => window.clearInterval(timer);
  }, [syncRun, t]);

  const sendMessage = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!accountId || !identityId || !compose.to.trim()) return;
    setBusy('sending');
    setError(undefined);
    setSubmission(undefined);
    void mail
      .sendMessage({
        accountId,
        identityId,
        to: compose.to
          .split(',')
          .map((address) => address.trim())
          .filter(Boolean)
          .map((address) => ({ address })),
        subject: compose.subject,
        text: compose.text,
        idempotencyKey: createIdempotencyKey(),
      })
      .then(setSubmission)
      .catch((cause: unknown) =>
        setError(
          mailErrorMessage(
            cause,
            t('errors.sendFailed', {
              defaultValue: 'Could not submit the message.',
            }),
          ),
        ),
      )
      .finally(() => setBusy(undefined));
  };

  const startSync = (): void => {
    if (!accountId) return;
    setBusy('syncing');
    setError(undefined);
    setSyncRun(undefined);
    void mail
      .startSync({
        accountId,
        mode: syncMode,
        receivedAfter:
          syncMode === 'initial' && policy.receivedAfter
            ? new Date(`${policy.receivedAfter}T00:00:00Z`).toISOString()
            : undefined,
        maxMessages: policy.maxMessages,
        batchSize: policy.batchSize,
      })
      .then(setSyncRun)
      .catch((cause: unknown) => {
        setError(
          mailErrorMessage(
            cause,
            t('errors.syncFailed', {
              defaultValue: 'Could not start mailbox synchronization.',
            }),
          ),
        );
        setBusy(undefined);
      });
  };

  return (
    <main className='min-h-[calc(100svh-4rem)] bg-muted/20'>
      <MailPageHeader
        actions={
          <Button
            disabled={busy === 'loading'}
            onClick={loadAccounts}
            variant='outline'
          >
            <RefreshCw aria-hidden='true' className='size-4' />
            {t('actions.reloadAccounts', { defaultValue: 'Reload accounts' })}
          </Button>
        }
        description={t('dev.description', {
          defaultValue:
            'Exercise the send and synchronization APIs against a connected account. This route is excluded from production builds.',
        })}
        eyebrow={t('dev.eyebrow', { defaultValue: 'Development tools' })}
        title={t('dev.title', { defaultValue: 'Mail playground' })}
      />

      <div className='mx-auto w-full max-w-7xl space-y-6 px-6 py-6'>
        {error ? (
          <div className='rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive'>
            {error}
          </div>
        ) : null}

        <Card className='p-5 shadow-sm'>
          <div className='grid gap-4 md:grid-cols-2'>
            <label className='text-sm font-medium'>
              {t('dev.account', { defaultValue: 'Account' })}
              <NativeSelect
                className='mt-1'
                onChange={(event) => setAccountId(event.target.value)}
                value={accountId}
              >
                {accounts.length === 0 ? (
                  <option value=''>
                    {t('dev.noAccounts', {
                      defaultValue: 'No connected accounts',
                    })}
                  </option>
                ) : null}
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.address}
                  </option>
                ))}
              </NativeSelect>
            </label>
            <label className='text-sm font-medium'>
              {t('dev.identity', { defaultValue: 'Sending identity' })}
              <NativeSelect
                className='mt-1'
                disabled={!accountId}
                onChange={(event) => setIdentityId(event.target.value)}
                value={identityId}
              >
                {identities.map((identity) => (
                  <option key={identity.id} value={identity.id}>
                    {identity.displayName
                      ? `${identity.displayName} <${identity.address}>`
                      : identity.address}
                  </option>
                ))}
              </NativeSelect>
            </label>
          </div>
          {selectedAccount ? (
            <p className='mt-3 text-xs text-muted-foreground'>
              {selectedAccount.provider.type} / {selectedAccount.provider.name}
            </p>
          ) : null}
        </Card>

        <div className='grid gap-6 xl:grid-cols-2'>
          <Card className='p-5 shadow-sm'>
            <div className='flex items-center gap-2'>
              <Send aria-hidden='true' className='size-5 text-primary' />
              <h2 className='font-semibold'>
                {t('dev.send.title', { defaultValue: 'Send a message' })}
              </h2>
            </div>
            <p className='mt-1 text-sm text-muted-foreground'>
              {t('dev.send.description', {
                defaultValue:
                  'Each submission receives a fresh idempotency key and runs through the Mail send operation.',
              })}
            </p>
            <form className='mt-5 space-y-4' onSubmit={sendMessage}>
              <label className='block text-sm font-medium'>
                {t('dev.send.to', { defaultValue: 'To' })}
                <Input
                  className='mt-1'
                  onChange={(event) =>
                    setCompose((current) => ({
                      ...current,
                      to: event.target.value,
                    }))
                  }
                  placeholder={t('dev.send.toPlaceholder', {
                    defaultValue: 'alice@example.com, bob@example.com',
                  })}
                  required
                  value={compose.to}
                />
              </label>
              <label className='block text-sm font-medium'>
                {t('dev.send.subject', { defaultValue: 'Subject' })}
                <Input
                  className='mt-1'
                  onChange={(event) =>
                    setCompose((current) => ({
                      ...current,
                      subject: event.target.value,
                    }))
                  }
                  placeholder={t('dev.send.subjectPlaceholder', {
                    defaultValue: 'NocoBase mail test',
                  })}
                  required
                  value={compose.subject}
                />
              </label>
              <label className='block text-sm font-medium'>
                {t('dev.send.body', { defaultValue: 'Plain-text body' })}
                <Textarea
                  className='mt-1 min-h-32'
                  onChange={(event) =>
                    setCompose((current) => ({
                      ...current,
                      text: event.target.value,
                    }))
                  }
                  placeholder={t('dev.send.bodyPlaceholder', {
                    defaultValue:
                      'This message was sent from the NocoBase Mail development page.',
                  })}
                  required
                  value={compose.text}
                />
              </label>
              <Button
                disabled={!accountId || !identityId || busy === 'sending'}
                type='submit'
              >
                <Send aria-hidden='true' className='size-4' />
                {busy === 'sending'
                  ? t('dev.send.sending', { defaultValue: 'Submitting…' })
                  : t('dev.send.submit', { defaultValue: 'Submit message' })}
              </Button>
            </form>
            {submission ? (
              <ResultRow
                detail={submission.providerMessageId ?? submission.id}
                label={t('dev.send.accepted', {
                  defaultValue: 'Submission',
                })}
                status={submission.status}
              />
            ) : null}
          </Card>

          <Card className='p-5 shadow-sm'>
            <div className='flex items-center gap-2'>
              <RefreshCw aria-hidden='true' className='size-5 text-primary' />
              <h2 className='font-semibold'>
                {t('dev.sync.title', { defaultValue: 'Synchronize mailbox' })}
              </h2>
            </div>
            <p className='mt-1 text-sm text-muted-foreground'>
              {t('dev.sync.description', {
                defaultValue:
                  'Use bounded initial sync for a new account. Use incremental sync after a baseline cursor exists.',
              })}
            </p>
            <div className='mt-5 space-y-4'>
              <label className='block text-sm font-medium'>
                {t('dev.sync.mode', { defaultValue: 'Mode' })}
                <NativeSelect
                  className='mt-1'
                  onChange={(event) =>
                    setSyncMode(event.target.value as MailSyncMode)
                  }
                  value={syncMode}
                >
                  <option value='initial'>
                    {t('dev.sync.initial', { defaultValue: 'Initial' })}
                  </option>
                  <option value='incremental'>
                    {t('dev.sync.incremental', { defaultValue: 'Incremental' })}
                  </option>
                </NativeSelect>
              </label>
              <MailSyncPolicyFields
                disabled={busy === 'syncing'}
                labels={{
                  receivedAfter: t('settings.initialSync.receivedAfter', {
                    defaultValue: 'Import messages received after',
                  }),
                  maxMessages: t('settings.initialSync.maxMessages', {
                    defaultValue: 'Maximum messages',
                  }),
                  batchSize: t('settings.initialSync.batchSize', {
                    defaultValue: 'Messages per batch',
                  }),
                }}
                onChange={setPolicy}
                value={policy}
              />
              <Button
                disabled={!accountId || busy === 'syncing'}
                onClick={startSync}
                type='button'
              >
                <RefreshCw
                  aria-hidden='true'
                  className={`size-4 ${busy === 'syncing' ? 'animate-spin' : ''}`}
                />
                {t('dev.sync.start', { defaultValue: 'Start sync' })}
              </Button>
            </div>
            {syncRun ? (
              <ResultRow
                detail={`${syncRun.processedMessages} messages · ${syncRun.processedPages} batches · ${syncRun.phase}`}
                label={t('dev.sync.run', { defaultValue: 'Sync run' })}
                status={syncRun.status}
              />
            ) : null}
          </Card>
        </div>

        <section className='overflow-hidden rounded-xl border bg-card shadow-sm'>
          <div className='flex items-center gap-2 border-b px-5 py-4'>
            <Inbox aria-hidden='true' className='size-5 text-primary' />
            <h2 className='font-semibold'>
              {t('dev.messages.title', {
                defaultValue: 'Synchronized messages',
              })}
            </h2>
          </div>
          {messages.length === 0 ? (
            <div className='p-10 text-center text-sm text-muted-foreground'>
              {t('dev.messages.empty', {
                defaultValue:
                  'No local messages are available. Run a synchronization first.',
              })}
            </div>
          ) : (
            <div className='divide-y'>
              {messages.map((message) => (
                <article className='px-5 py-4' key={message.id}>
                  <div className='flex items-start justify-between gap-4'>
                    <div className='min-w-0'>
                      <p className='truncate font-medium'>
                        {message.subject ||
                          t('dev.messages.noSubject', {
                            defaultValue: '(no subject)',
                          })}
                      </p>
                      <p className='mt-0.5 truncate text-sm text-muted-foreground'>
                        {message.from?.name ||
                          message.from?.address ||
                          t('dev.messages.unknownSender', {
                            defaultValue: 'Unknown sender',
                          })}
                      </p>
                      {message.preview ? (
                        <p className='mt-2 line-clamp-2 text-sm text-muted-foreground'>
                          {message.preview}
                        </p>
                      ) : null}
                    </div>
                    <time className='shrink-0 text-xs text-muted-foreground'>
                      {formatDate(message.receivedAt ?? message.sentAt)}
                    </time>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function ResultRow({
  label,
  status,
  detail,
}: {
  readonly label: string;
  readonly status: string;
  readonly detail: string;
}): ReactElement {
  return (
    <div className='mt-5 flex flex-wrap items-center gap-2 rounded-lg border bg-muted/20 p-3 text-sm'>
      <span className='font-medium'>{label}</span>
      <MailStatusBadge label={status} tone={statusTone(status)} />
      <span className='break-all text-muted-foreground'>{detail}</span>
    </div>
  );
}

function statusTone(status: string): 'success' | 'danger' | 'info' {
  if (status === 'accepted' || status === 'completed') return 'success';
  if (status === 'failed' || status === 'cancelled') return 'danger';
  return 'info';
}

function dateDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

function createIdempotencyKey(): string {
  return `mail-dev-${globalThis.crypto.randomUUID()}`;
}

function formatDate(value: string | undefined): string {
  return value ? new Date(value).toLocaleString() : '—';
}
