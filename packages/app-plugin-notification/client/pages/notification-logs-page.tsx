import { Fragment, useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';

import type {
  NotificationDeliveryDetails,
  NotificationLogDetails,
  NotificationStatus,
} from '../notification-client.js';
import { getNotificationClient } from '../runtime.js';

const notification = getNotificationClient();

export default function NotificationLogsPage(): ReactElement {
  const [logs, setLogs] = useState<readonly NotificationLogDetails[]>([]);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

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
          if (active) setError(errorMessage(cause));
        },
      )
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [revision]);

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
              Notifications
            </p>
            <h1 className='mt-1 text-2xl font-semibold tracking-tight'>
              Notification logs
            </h1>
            <p className='mt-1 max-w-3xl text-sm text-muted-foreground'>
              Trace notification delivery and every provider attempt. Message
              bodies, recipients, and lease tokens are redacted.
            </p>
          </div>
          <button
            className='inline-flex h-9 items-center justify-center rounded-md border bg-background px-4 text-sm font-medium shadow-xs hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50'
            disabled={loading}
            onClick={refresh}
            type='button'
          >
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </header>

      <div className='mx-auto w-full max-w-7xl space-y-5 px-6 py-6'>
        <div className='grid max-w-md grid-cols-2 gap-3'>
          <Metric label='Deliveries shown' value={totals.deliveries} />
          <Metric attention label='Need attention' value={totals.attention} />
        </div>

        {error ? (
          <div className='rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive'>
            <p className='font-medium'>Logs unavailable</p>
            <p className='mt-1'>{error}</p>
          </div>
        ) : null}

        <section className='overflow-hidden rounded-xl border bg-card shadow-sm'>
          <div className='border-b bg-muted/20 px-5 py-4'>
            <h2 className='font-semibold'>Recent notifications</h2>
          </div>
          {loading ? (
            <div className='p-12 text-center text-sm text-muted-foreground'>
              Loading delivery history…
            </div>
          ) : logs.length === 0 ? (
            <div className='p-12 text-center'>
              <p className='font-medium'>No deliveries yet</p>
              <p className='mt-1 text-sm text-muted-foreground'>
                Delivery records will appear here after notifications are sent.
              </p>
            </div>
          ) : (
            <NotificationLogsTable logs={logs} />
          )}
        </section>
      </div>
    </main>
  );
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
  return (
    <div className='overflow-x-auto'>
      <table className='w-full min-w-[860px] text-sm'>
        <thead className='bg-muted/35 text-left'>
          <tr className='border-b'>
            <th className='w-12 px-4 py-3' aria-label='Expand notification' />
            <th className='px-4 py-3 font-medium'>Source</th>
            <th className='px-4 py-3 font-medium'>Notification ID</th>
            <th className='px-4 py-3 font-medium'>Status</th>
            <th className='px-4 py-3 text-right font-medium'>Deliveries</th>
            <th className='px-4 py-3 font-medium'>Created</th>
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
  const [open, setOpen] = useState(false);
  return (
    <Fragment>
      <tr className='border-b' aria-expanded={open}>
        <td className='px-4 py-3'>
          <button
            className='grid size-8 place-items-center rounded-md hover:bg-muted'
            aria-label={open ? 'Collapse notification' : 'Expand notification'}
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
  if (deliveries.length === 0) {
    return (
      <p className='py-4 text-center text-sm text-muted-foreground'>
        No deliveries recorded.
      </p>
    );
  }

  return (
    <div className='overflow-x-auto rounded-lg border bg-background'>
      <table className='w-full min-w-[760px] text-sm'>
        <thead className='bg-muted/35 text-left'>
          <tr className='border-b'>
            <th className='px-4 py-3 font-medium'>Channel</th>
            <th className='px-4 py-3 font-medium'>Provider</th>
            <th className='px-4 py-3 font-medium'>Status</th>
            <th className='px-4 py-3 text-right font-medium'>Attempts</th>
            <th className='px-4 py-3 font-medium'>Updated</th>
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
  if (details.attempts.length === 0) {
    return (
      <p className='text-xs text-muted-foreground'>No attempts recorded.</p>
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
  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${statusTone(status)}`}
    >
      {status.replace('_', ' ')}
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

function errorMessage(value: unknown): string {
  return value instanceof Error
    ? value.message
    : 'Notification request failed.';
}
