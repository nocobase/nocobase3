import { Fragment, useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { useTranslation } from '@nocobase/app-i18n/client';

import type {
  NotificationDeliveryDetails,
  NotificationLogDetails,
  NotificationStatus,
  NotificationTestProvider,
} from '../notification-client.js';
import { getNotificationClient } from '../runtime.js';

const notification = getNotificationClient();

export default function NotificationLogsPage(): ReactElement {
  const { t } = useTranslation();
  const [logs, setLogs] = useState<readonly NotificationLogDetails[]>([]);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [testOpen, setTestOpen] = useState(false);

  const refresh = (): void => {
    setLoading(true);
    setError(undefined);
    setRevision((value) => value + 1);
  };

  useEffect(() => {
    let active = true;
    void notification
      .listLogs()
      .then(
        (nextLogs) => {
          if (active) setLogs(nextLogs);
        },
        (cause: unknown) => {
          if (active)
            setError(
              errorMessage(
                cause,
                t('errors.requestFailed', {
                  defaultValue: 'Notification request failed.',
                }),
              ),
            );
        },
      )
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [revision, t]);

  const totals = useMemo(
    () => ({
      deliveries: logs.reduce((sum, item) => sum + item.deliveries.length, 0),
      attention: logs.filter((item) =>
        ['failed', 'partial', 'unknown'].includes(item.log.status),
      ).length,
    }),
    [logs],
  );

  return (
    <main className='min-h-[calc(100svh-4rem)] bg-muted/20'>
      <header className='border-b bg-background px-6 py-7'>
        <div className='mx-auto flex w-full max-w-7xl flex-col gap-4 sm:flex-row sm:items-end sm:justify-between'>
          <div>
            <p className='text-xs font-medium tracking-wide text-muted-foreground uppercase'>
              {t('logs.eyebrow', { defaultValue: 'Notifications' })}
            </p>
            <h1 className='mt-1 text-2xl font-semibold tracking-tight'>
              {t('logs.title', { defaultValue: 'Notification logs' })}
            </h1>
            <p className='mt-1 max-w-3xl text-sm text-muted-foreground'>
              {t('logs.description', {
                defaultValue:
                  'Trace notification delivery and every provider attempt. Message bodies, recipients, and lease tokens are redacted.',
              })}
            </p>
          </div>
          <div className='flex flex-wrap gap-2'>
            <button
              className='inline-flex h-9 items-center justify-center rounded-md border bg-background px-4 text-sm font-medium shadow-xs hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50'
              disabled={loading}
              onClick={refresh}
              type='button'
            >
              {loading
                ? t('logs.refreshing', { defaultValue: 'Refreshing…' })
                : t('logs.refresh', { defaultValue: 'Refresh' })}
            </button>
            <button
              className='inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-xs hover:bg-primary/90'
              onClick={() => setTestOpen(true)}
              type='button'
            >
              {t('logs.sendTest', {
                defaultValue: 'Send test notification',
              })}
            </button>
          </div>
        </div>
      </header>

      <div className='mx-auto w-full max-w-7xl space-y-5 px-6 py-6'>
        <div className='grid max-w-md grid-cols-2 gap-3'>
          <Metric
            label={t('logs.deliveriesShown', {
              defaultValue: 'Deliveries shown',
            })}
            value={totals.deliveries}
          />
          <Metric
            attention
            label={t('logs.needAttention', { defaultValue: 'Need attention' })}
            value={totals.attention}
          />
        </div>

        {error ? (
          <div className='rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive'>
            <p className='font-medium'>
              {t('logs.unavailable', { defaultValue: 'Logs unavailable' })}
            </p>
            <p className='mt-1'>{error}</p>
          </div>
        ) : null}

        <section className='overflow-hidden rounded-xl border bg-card shadow-sm'>
          <div className='border-b bg-muted/20 px-5 py-4'>
            <h2 className='font-semibold'>
              {t('logs.recent', { defaultValue: 'Recent notifications' })}
            </h2>
          </div>
          {loading ? (
            <div className='p-12 text-center text-sm text-muted-foreground'>
              {t('logs.loading', {
                defaultValue: 'Loading delivery history…',
              })}
            </div>
          ) : logs.length === 0 ? (
            <div className='p-12 text-center'>
              <p className='font-medium'>
                {t('logs.emptyTitle', { defaultValue: 'No deliveries yet' })}
              </p>
              <p className='mt-1 text-sm text-muted-foreground'>
                {t('logs.emptyDescription', {
                  defaultValue:
                    'Delivery records will appear here after notifications are sent.',
                })}
              </p>
            </div>
          ) : (
            <NotificationLogsTable logs={logs} />
          )}
        </section>
      </div>
      {testOpen ? (
        <TestNotificationDialog
          onClose={() => setTestOpen(false)}
          onSent={refresh}
        />
      ) : null}
    </main>
  );
}

function TestNotificationDialog({
  onClose,
  onSent,
}: {
  readonly onClose: () => void;
  readonly onSent: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const [providers, setProviders] = useState<
    readonly NotificationTestProvider[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<NotificationTestProvider>();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();
  const [recipient, setRecipient] = useState('');
  const [title, setTitle] = useState(() =>
    t('test.defaultTitle', { defaultValue: 'NocoBase notification test' }),
  );
  const [body, setBody] = useState(() =>
    t('test.defaultBody', {
      defaultValue: 'This is a test notification from Hub.',
    }),
  );

  useEffect(() => {
    let active = true;
    void notification
      .listTestProviders()
      .then(
        (items) => {
          if (active) setProviders(items);
        },
        (cause: unknown) => {
          if (active)
            setError(
              errorMessage(
                cause,
                t('errors.requestFailed', {
                  defaultValue: 'Notification request failed.',
                }),
              ),
            );
        },
      )
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [t]);

  const channels = useMemo(
    () => [...new Set(providers.map((item) => item.channel))],
    [providers],
  );

  const send = (): void => {
    if (!selected) return;
    setSending(true);
    setError(undefined);
    setSuccess(undefined);
    void notification
      .sendTest({
        ...selected,
        recipient: recipient.trim() || undefined,
        title: title.trim(),
        body: body.trim(),
      })
      .then(
        (result) => {
          setSuccess(
            t('test.accepted', {
              defaultValue: `Test notification ${result.notificationId} accepted.`,
              id: result.notificationId,
            }),
          );
          onSent();
        },
        (cause: unknown) =>
          setError(
            errorMessage(
              cause,
              t('errors.requestFailed', {
                defaultValue: 'Notification request failed.',
              }),
            ),
          ),
      )
      .finally(() => setSending(false));
  };

  return (
    <div
      className='fixed inset-0 z-50 grid place-items-center bg-black/45 p-4'
      role='presentation'
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !sending) onClose();
      }}
    >
      <section
        aria-labelledby='notification-test-title'
        aria-modal='true'
        className='max-h-[calc(100svh-2rem)] w-full max-w-xl overflow-y-auto rounded-xl border bg-background shadow-xl'
        role='dialog'
      >
        <div className='flex items-start justify-between gap-4 border-b px-5 py-4'>
          <div>
            <h2 id='notification-test-title' className='font-semibold'>
              {t('test.title', { defaultValue: 'Send test notification' })}
            </h2>
            <p className='mt-1 text-sm text-muted-foreground'>
              {t('test.description', {
                defaultValue:
                  'Select a Channel and Provider, then click Send. The message is sent to the recipient you provide and recorded below.',
              })}
            </p>
          </div>
          <button
            aria-label={t('test.close', {
              defaultValue: 'Close test notification dialog',
            })}
            className='grid size-8 shrink-0 place-items-center rounded-md text-lg hover:bg-muted disabled:opacity-50'
            disabled={sending}
            onClick={onClose}
            type='button'
          >
            ×
          </button>
        </div>

        <div className='space-y-4 px-5 py-5'>
          {loading ? (
            <span className='text-sm text-muted-foreground'>
              {t('test.loadingProviders', {
                defaultValue: 'Loading configured Providers…',
              })}
            </span>
          ) : providers.length === 0 && !error ? (
            <span className='rounded-md border bg-muted/20 p-3 text-sm text-muted-foreground'>
              {t('test.noProviders', {
                defaultValue: 'No enabled Providers are configured.',
              })}
            </span>
          ) : (
            <label className='grid gap-1.5 text-sm font-medium'>
              {t('test.channelProvider', {
                defaultValue: 'Channel and Provider',
              })}
              <select
                aria-label={t('test.channelProvider', {
                  defaultValue: 'Channel and Provider',
                })}
                className='h-9 w-full rounded-md border bg-background px-3 font-normal outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50'
                disabled={sending}
                onChange={(event) => {
                  setSelected(
                    providers.find(
                      (item) => providerKey(item) === event.target.value,
                    ),
                  );
                  setRecipient('');
                }}
                value={selected ? providerKey(selected) : ''}
              >
                <option value=''>
                  {t('test.selectProvider', {
                    defaultValue: 'Select a Channel and Provider',
                  })}
                </option>
                {channels.map((channel) => (
                  <optgroup key={channel} label={channelLabel(channel)}>
                    {providers
                      .filter((item) => item.channel === channel)
                      .map((item) => (
                        <option
                          key={providerKey(item)}
                          value={providerKey(item)}
                        >
                          {providerLabel(item)}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </select>
            </label>
          )}

          {selected && selected.channel !== 'im' ? (
            <label className='grid gap-1.5 text-sm font-medium'>
              {t('test.recipient', { defaultValue: 'Recipient' })}
              <input
                aria-label={t('test.recipient', { defaultValue: 'Recipient' })}
                className='h-9 rounded-md border bg-background px-3 font-normal outline-none focus:ring-2 focus:ring-ring'
                disabled={sending}
                onChange={(event) => setRecipient(event.target.value)}
                placeholder={
                  selected.channel === 'email'
                    ? 'name@example.com'
                    : t('test.userIdPlaceholder', {
                        defaultValue: 'User ID',
                      })
                }
                required
                type={selected.channel === 'email' ? 'email' : 'text'}
                value={recipient}
              />
              <span className='text-xs font-normal text-muted-foreground'>
                {selected.channel === 'email'
                  ? t('test.emailHelp', {
                      defaultValue:
                        'The email address that should receive this test.',
                    })
                  : t('test.userHelp', {
                      defaultValue:
                        'The user ID that should receive this in-app message.',
                    })}
              </span>
            </label>
          ) : null}

          <label className='grid gap-1.5 text-sm font-medium'>
            {t('test.messageTitle', { defaultValue: 'Title' })}
            <input
              className='h-9 rounded-md border bg-background px-3 font-normal outline-none focus:ring-2 focus:ring-ring'
              disabled={sending}
              maxLength={200}
              onChange={(event) => setTitle(event.target.value)}
              value={title}
            />
          </label>
          <label className='grid gap-1.5 text-sm font-medium'>
            {t('test.message', { defaultValue: 'Message' })}
            <textarea
              className='min-h-24 resize-y rounded-md border bg-background px-3 py-2 font-normal outline-none focus:ring-2 focus:ring-ring'
              disabled={sending}
              maxLength={2000}
              onChange={(event) => setBody(event.target.value)}
              value={body}
            />
          </label>

          {error ? (
            <div className='rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive'>
              {error}
            </div>
          ) : null}
          {success ? (
            <div className='rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-400'>
              {success}
            </div>
          ) : null}
        </div>
        <div className='flex justify-end gap-2 border-t px-5 py-4'>
          <button
            className='inline-flex h-9 items-center justify-center rounded-md border bg-background px-4 text-sm font-medium shadow-xs hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50'
            disabled={sending}
            onClick={onClose}
            type='button'
          >
            {t('test.cancel', { defaultValue: 'Cancel' })}
          </button>
          <button
            className='inline-flex h-9 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground shadow-xs hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50'
            disabled={
              sending ||
              !selected ||
              !title.trim() ||
              !body.trim() ||
              !testRecipientIsValid(selected.channel, recipient)
            }
            onClick={send}
            type='button'
          >
            {sending
              ? t('test.sending', { defaultValue: 'Sending…' })
              : t('test.send', { defaultValue: 'Send' })}
          </button>
        </div>
      </section>
    </div>
  );
}

function providerKey(item: NotificationTestProvider): string {
  return `${item.channel}:${item.provider.name}:${item.provider.type}`;
}

function providerLabel(item: NotificationTestProvider): string {
  return `${item.provider.name} (${item.provider.type})`;
}

function channelLabel(channel: string): string {
  return channel
    .split('-')
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function testRecipientIsValid(channel: string, recipient: string): boolean {
  if (channel === 'im') return true;
  const value = recipient.trim();
  if (channel === 'email') {
    return value.length <= 320 && /^[^\s@]+@[^\s@]+$/.test(value);
  }
  return value.length > 0 && value.length <= 255;
}

function Metric({
  label,
  value,
  attention = false,
}: {
  readonly label: string;
  readonly value: number;
  readonly attention?: boolean;
}): ReactElement {
  return (
    <div className='rounded-xl border bg-card px-4 py-3 shadow-sm'>
      <div
        className={`text-2xl font-semibold tabular-nums ${attention && value > 0 ? 'text-destructive' : ''}`}
      >
        {value}
      </div>
      <div className='text-xs text-muted-foreground'>{label}</div>
    </div>
  );
}

function NotificationLogsTable({
  logs,
}: {
  readonly logs: readonly NotificationLogDetails[];
}): ReactElement {
  const { t } = useTranslation();
  return (
    <div className='overflow-x-auto'>
      <table className='w-full min-w-[860px] text-sm'>
        <thead className='bg-muted/35 text-left'>
          <tr className='border-b'>
            <th
              className='w-12 px-4 py-3'
              aria-label={t('logs.expand', {
                defaultValue: 'Expand notification',
              })}
            />
            <th className='px-4 py-3 font-medium'>
              {t('logs.columns.source', { defaultValue: 'Source' })}
            </th>
            <th className='px-4 py-3 font-medium'>
              {t('logs.columns.notificationId', {
                defaultValue: 'Notification ID',
              })}
            </th>
            <th className='px-4 py-3 font-medium'>
              {t('logs.columns.status', { defaultValue: 'Status' })}
            </th>
            <th className='px-4 py-3 text-right font-medium'>
              {t('logs.columns.deliveries', { defaultValue: 'Deliveries' })}
            </th>
            <th className='px-4 py-3 font-medium'>
              {t('logs.columns.created', { defaultValue: 'Created' })}
            </th>
          </tr>
        </thead>
        <tbody>
          {logs.map((details) => (
            <NotificationTableRow key={details.log.id} details={details} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function NotificationTableRow({
  details,
}: {
  readonly details: NotificationLogDetails;
}): ReactElement {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <Fragment>
      <tr className='border-b' aria-expanded={open}>
        <td className='px-4 py-3'>
          <button
            className='grid size-8 place-items-center rounded-md hover:bg-muted'
            aria-label={
              open
                ? t('logs.collapse', {
                    defaultValue: 'Collapse notification',
                  })
                : t('logs.expand', { defaultValue: 'Expand notification' })
            }
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
            type='button'
          >
            <span className={`transition-transform ${open ? 'rotate-90' : ''}`}>
              ›
            </span>
          </button>
        </td>
        <td className='px-4 py-3'>
          <div className='font-medium'>{details.log.sourceType}</div>
          {details.log.sourceReferenceId ? (
            <div className='mt-0.5 max-w-48 truncate text-xs text-muted-foreground'>
              {details.log.sourceReferenceId}
            </div>
          ) : null}
        </td>
        <td className='px-4 py-3'>
          <code
            className='text-xs text-muted-foreground'
            title={details.log.id}
          >
            {details.log.id}
          </code>
        </td>
        <td className='px-4 py-3'>
          <StatusBadge status={details.log.status} />
        </td>
        <td className='px-4 py-3 text-right tabular-nums'>
          {details.deliveries.length}
        </td>
        <td className='whitespace-nowrap px-4 py-3 text-muted-foreground'>
          <time dateTime={details.log.createdAt}>
            {formatTime(details.log.createdAt)}
          </time>
        </td>
      </tr>
      {open ? (
        <tr className='border-b bg-muted/15'>
          <td colSpan={6} className='p-4 sm:px-12'>
            <DeliveryTable deliveries={details.deliveries} />
          </td>
        </tr>
      ) : null}
    </Fragment>
  );
}

function DeliveryTable({
  deliveries,
}: {
  readonly deliveries: readonly NotificationDeliveryDetails[];
}): ReactElement {
  const { t } = useTranslation();
  if (deliveries.length === 0) {
    return (
      <p className='py-4 text-center text-sm text-muted-foreground'>
        {t('logs.noDeliveries', {
          defaultValue: 'No deliveries recorded.',
        })}
      </p>
    );
  }

  return (
    <div className='overflow-x-auto rounded-lg border bg-background'>
      <table className='w-full min-w-[760px] text-sm'>
        <thead className='bg-muted/35 text-left'>
          <tr className='border-b'>
            <th className='px-4 py-3 font-medium'>
              {t('logs.columns.channel', { defaultValue: 'Channel' })}
            </th>
            <th className='px-4 py-3 font-medium'>
              {t('logs.columns.provider', { defaultValue: 'Provider' })}
            </th>
            <th className='px-4 py-3 font-medium'>
              {t('logs.columns.status', { defaultValue: 'Status' })}
            </th>
            <th className='px-4 py-3 text-right font-medium'>
              {t('logs.columns.attempts', { defaultValue: 'Attempts' })}
            </th>
            <th className='px-4 py-3 font-medium'>
              {t('logs.columns.updated', { defaultValue: 'Updated' })}
            </th>
          </tr>
        </thead>
        <tbody>
          {deliveries.map((details) => (
            <Fragment key={details.delivery.id}>
              <tr className='border-b'>
                <td className='px-4 py-3'>{details.delivery.channel}</td>
                <td className='px-4 py-3'>
                  <div className='font-medium'>
                    {details.delivery.providerName}
                  </div>
                  <div className='text-xs text-muted-foreground'>
                    {details.delivery.providerType}
                  </div>
                </td>
                <td className='px-4 py-3'>
                  <StatusBadge status={details.delivery.status} />
                </td>
                <td className='px-4 py-3 text-right tabular-nums'>
                  {details.attempts.length}
                </td>
                <td className='whitespace-nowrap px-4 py-3 text-muted-foreground'>
                  {formatTime(details.delivery.updatedAt)}
                </td>
              </tr>
              <tr className='border-b bg-muted/10'>
                <td colSpan={5} className='px-4 py-3'>
                  <AttemptList details={details} />
                </td>
              </tr>
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AttemptList({
  details,
}: {
  readonly details: NotificationDeliveryDetails;
}): ReactElement {
  const { t } = useTranslation();
  if (details.attempts.length === 0) {
    return (
      <p className='text-xs text-muted-foreground'>
        {t('logs.noAttempts', { defaultValue: 'No attempts recorded.' })}
      </p>
    );
  }
  return (
    <div className='grid gap-1.5'>
      {details.attempts.map((attempt) => (
        <div
          key={attempt.id}
          className='grid grid-cols-[2.5rem_minmax(8rem,1fr)_auto] items-center gap-3 rounded-md bg-muted/35 px-3 py-2 text-xs'
        >
          <span className='font-mono text-muted-foreground'>
            #{attempt.sequence}
          </span>
          <span className='min-w-0'>
            <strong>{attempt.providerName}</strong>
            <span className='ml-2 text-muted-foreground'>
              {attempt.providerType}
            </span>
            {attempt.error ? (
              <span className='mt-1 block truncate text-destructive'>
                {attempt.error.message}
              </span>
            ) : null}
          </span>
          <StatusBadge status={attempt.status} />
        </div>
      ))}
    </div>
  );
}

function StatusBadge({
  status,
}: {
  readonly status: NotificationStatus;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${statusTone(status)}`}
    >
      {t(`status.${status}`, { defaultValue: status.replace('_', ' ') })}
    </span>
  );
}

function statusTone(status: NotificationStatus): string {
  if (status === 'completed' || status === 'accepted') {
    return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400';
  }
  if (status === 'failed' || status === 'unknown' || status === 'partial') {
    return 'border-destructive/20 bg-destructive/10 text-destructive';
  }
  return 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400';
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function errorMessage(value: unknown, fallback: string): string {
  return value instanceof Error ? value.message : fallback;
}
