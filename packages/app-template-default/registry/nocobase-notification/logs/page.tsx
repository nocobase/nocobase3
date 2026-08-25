import { useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  CircleDot,
  FileClock,
  RefreshCw,
  Send,
} from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  fetchNotificationLogs,
  type NotificationDeliveryDetails,
  type NotificationLogDetails,
  type NotificationStatus,
} from './api.js';
import { SendNotificationTestDialog } from './send-test-dialog.js';

export function NotificationLogsPage(): React.ReactElement {
  const [logs, setLogs] = useState<readonly NotificationLogDetails[]>([]);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [testOpen, setTestOpen] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(undefined);
    fetchNotificationLogs(controller.signal)
      .then(setLogs)
      .catch((reason: Error) => {
        if (reason.name !== 'AbortError') setError(reason.message);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
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
    <div className='mx-auto flex w-full max-w-6xl flex-col gap-5'>
      <header className='flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between'>
        <div>
          <div className='mb-2 flex items-center gap-2 text-sm font-medium text-primary'>
            <FileClock className='size-4' /> Delivery operations
          </div>
          <h1 className='text-2xl font-semibold tracking-tight'>
            Notification logs
          </h1>
          <p className='mt-1 text-sm text-muted-foreground'>
            Trace each channel handoff and every provider attempt.
          </p>
        </div>
        <div className='flex gap-2'>
          <Button
            variant='outline'
            onClick={() => setRevision((value) => value + 1)}
          >
            <RefreshCw className={loading ? 'animate-spin' : undefined} />
            Refresh
          </Button>
          <Button onClick={() => setTestOpen(true)}>
            <Send /> Send test
          </Button>
        </div>
      </header>

      <div className='grid grid-cols-2 gap-3 sm:max-w-md'>
        <Metric label='Deliveries shown' value={totals.deliveries} />
        <Metric label='Need attention' value={totals.attention} attention />
      </div>

      {error ? (
        <Alert variant='destructive'>
          <AlertTitle>Logs unavailable</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Card className='gap-0 overflow-hidden py-0'>
        <CardHeader className='border-b bg-muted/20 py-4'>
          <CardTitle className='text-base'>Recent notifications</CardTitle>
          <CardDescription>
            Message bodies, recipients, and lease tokens are redacted.
          </CardDescription>
        </CardHeader>
        <CardContent className='p-0'>
          {loading ? (
            <div className='p-12 text-center text-sm text-muted-foreground'>
              Loading delivery history…
            </div>
          ) : logs.length === 0 ? (
            <div className='grid place-items-center gap-2 p-12 text-center'>
              <div className='grid size-12 place-items-center rounded-full bg-muted'>
                <FileClock className='size-5 text-muted-foreground' />
              </div>
              <p className='font-medium'>No deliveries yet</p>
              <p className='text-sm text-muted-foreground'>
                Send a test notification to verify the pipeline.
              </p>
            </div>
          ) : (
            <div className='divide-y'>
              {logs.map((item) => (
                <LogRow key={item.log.id} details={item} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <SendNotificationTestDialog
        open={testOpen}
        onOpenChange={setTestOpen}
        onSent={() => setRevision((value) => value + 1)}
      />
    </div>
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
}): React.ReactElement {
  return (
    <div className='rounded-xl border bg-card px-4 py-3'>
      <div
        className={`text-2xl font-semibold tabular-nums ${attention && value > 0 ? 'text-destructive' : ''}`}
      >
        {value}
      </div>
      <div className='text-xs text-muted-foreground'>{label}</div>
    </div>
  );
}

function LogRow({
  details,
}: {
  readonly details: NotificationLogDetails;
}): React.ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <article>
      <button
        type='button'
        className='flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-muted/30 sm:px-5'
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <StatusDot status={details.log.status} />
        <div className='min-w-0 flex-1'>
          <div className='flex flex-wrap items-center gap-2'>
            <span className='font-medium'>{details.log.sourceType}</span>
            <StatusBadge status={details.log.status} />
          </div>
          <div className='mt-1 truncate font-mono text-xs text-muted-foreground'>
            {details.log.id}
          </div>
        </div>
        <div className='hidden text-right text-xs text-muted-foreground sm:block'>
          <div>{details.deliveries.length} deliveries</div>
          <time>{formatTime(details.log.createdAt)}</time>
        </div>
        <ChevronDown
          className={`size-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open ? (
        <div className='space-y-3 border-t bg-muted/15 p-4 sm:px-12'>
          {details.deliveries.map((delivery) => (
            <DeliveryCard key={delivery.delivery.id} details={delivery} />
          ))}
        </div>
      ) : null}
    </article>
  );
}

function DeliveryCard({
  details,
}: {
  readonly details: NotificationDeliveryDetails;
}): React.ReactElement {
  return (
    <div className='rounded-xl border bg-background p-4 shadow-xs'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <div className='flex items-center gap-2'>
          <Badge variant='outline'>{details.delivery.channel}</Badge>
          <StatusBadge status={details.delivery.status} />
        </div>
        <span className='font-mono text-xs text-muted-foreground'>
          {details.delivery.id}
        </span>
      </div>
      <div className='mt-4 grid gap-2'>
        {details.attempts.length === 0 ? (
          <p className='text-xs text-muted-foreground'>No attempts recorded.</p>
        ) : (
          details.attempts.map((attempt) => (
            <div
              key={attempt.id}
              className='grid gap-1 rounded-lg bg-muted/35 px-3 py-2 text-xs sm:grid-cols-[2rem_1fr_auto] sm:items-center'
            >
              <span className='font-mono text-muted-foreground'>
                #{attempt.sequence}
              </span>
              <span>
                <strong>{attempt.providerName}</strong>
                <span className='ml-2 text-muted-foreground'>
                  {attempt.providerType}
                </span>
              </span>
              <StatusBadge status={attempt.status} />
              {attempt.error ? (
                <p className='text-destructive sm:col-start-2 sm:col-span-2'>
                  {attempt.error.message}
                </p>
              ) : null}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function StatusDot({ status }: { readonly status: NotificationStatus }) {
  const tone = statusTone(status);
  return (
    <span className={`grid size-8 place-items-center rounded-full ${tone.dot}`}>
      <CircleDot className='size-4' />
    </span>
  );
}

function StatusBadge({ status }: { readonly status: NotificationStatus }) {
  const tone = statusTone(status);
  return <Badge className={tone.badge}>{status.replace('_', ' ')}</Badge>;
}

function statusTone(status: NotificationStatus): {
  readonly dot: string;
  readonly badge: string;
} {
  if (status === 'completed' || status === 'accepted')
    return {
      dot: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
      badge:
        'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
    };
  if (status === 'failed' || status === 'unknown' || status === 'partial')
    return {
      dot: 'bg-destructive/10 text-destructive',
      badge: 'border-destructive/20 bg-destructive/10 text-destructive',
    };
  return {
    dot: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
    badge:
      'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400',
  };
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}
