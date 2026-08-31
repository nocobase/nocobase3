import { Fragment, useEffect, useMemo, useState } from 'react';
import { ChevronDown, FileClock, RefreshCw } from 'lucide-react';

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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  fetchNotificationLogs,
  type NotificationDeliveryDetails,
  type NotificationLogDetails,
  type NotificationStatus,
} from './api.js';

export function NotificationLogsPage(): React.ReactElement {
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
    const controller = new AbortController();
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
        <div>
          <Button variant='outline' onClick={refresh}>
            <RefreshCw className={loading ? 'animate-spin' : undefined} />
            Refresh
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
                Delivery records will appear here after notifications are sent.
              </p>
            </div>
          ) : (
            <NotificationLogsTable logs={logs} />
          )}
        </CardContent>
      </Card>
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

function NotificationLogsTable({
  logs,
}: {
  readonly logs: readonly NotificationLogDetails[];
}): React.ReactElement {
  return (
    <Table className='min-w-[860px]'>
      <TableHeader className='bg-muted/35'>
        <TableRow className='hover:bg-muted/35'>
          <TableHead className='w-12' aria-label='Expand notification' />
          <TableHead>Source</TableHead>
          <TableHead>Notification ID</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className='text-right'>Deliveries</TableHead>
          <TableHead>Created</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {logs.map((details) => (
          <NotificationTableRow key={details.log.id} details={details} />
        ))}
      </TableBody>
    </Table>
  );
}

function NotificationTableRow({
  details,
}: {
  readonly details: NotificationLogDetails;
}): React.ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <Fragment>
      <TableRow aria-expanded={open}>
        <TableCell>
          <Button
            variant='ghost'
            size='icon-sm'
            aria-label={open ? 'Collapse notification' : 'Expand notification'}
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            <ChevronDown
              className={`size-4 transition-transform ${open ? 'rotate-180' : ''}`}
            />
          </Button>
        </TableCell>
        <TableCell>
          <div className='font-medium'>{details.log.sourceType}</div>
          {details.log.sourceReferenceId ? (
            <div className='mt-0.5 max-w-48 truncate text-xs text-muted-foreground'>
              {details.log.sourceReferenceId}
            </div>
          ) : null}
        </TableCell>
        <TableCell>
          <code
            className='text-xs text-muted-foreground'
            title={details.log.id}
          >
            {details.log.id}
          </code>
        </TableCell>
        <TableCell>
          <StatusBadge status={details.log.status} />
        </TableCell>
        <TableCell className='text-right tabular-nums'>
          {details.deliveries.length}
        </TableCell>
        <TableCell className='whitespace-nowrap text-muted-foreground'>
          <time dateTime={details.log.createdAt}>
            {formatTime(details.log.createdAt)}
          </time>
        </TableCell>
      </TableRow>
      {open ? (
        <TableRow className='bg-muted/15 hover:bg-muted/15'>
          <TableCell colSpan={6} className='p-4 sm:px-12'>
            <DeliveryTable deliveries={details.deliveries} />
          </TableCell>
        </TableRow>
      ) : null}
    </Fragment>
  );
}

function DeliveryTable({
  deliveries,
}: {
  readonly deliveries: readonly NotificationDeliveryDetails[];
}): React.ReactElement {
  if (deliveries.length === 0) {
    return (
      <p className='py-4 text-center text-sm text-muted-foreground'>
        No deliveries recorded.
      </p>
    );
  }

  return (
    <div className='overflow-hidden rounded-lg border bg-background'>
      <Table className='min-w-[760px]'>
        <TableHeader className='bg-muted/35'>
          <TableRow className='hover:bg-muted/35'>
            <TableHead>Channel</TableHead>
            <TableHead>Provider</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className='text-right'>Attempts</TableHead>
            <TableHead>Updated</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {deliveries.map((details) => (
            <Fragment key={details.delivery.id}>
              <TableRow>
                <TableCell>
                  <Badge variant='outline'>{details.delivery.channel}</Badge>
                </TableCell>
                <TableCell>
                  <div className='font-medium'>
                    {details.delivery.providerName}
                  </div>
                  <div className='text-xs text-muted-foreground'>
                    {details.delivery.providerType}
                  </div>
                </TableCell>
                <TableCell>
                  <StatusBadge status={details.delivery.status} />
                </TableCell>
                <TableCell className='text-right tabular-nums'>
                  {details.attempts.length}
                </TableCell>
                <TableCell className='whitespace-nowrap text-muted-foreground'>
                  {formatTime(details.delivery.updatedAt)}
                </TableCell>
              </TableRow>
              <TableRow className='bg-muted/10 hover:bg-muted/10'>
                <TableCell colSpan={5} className='px-4 py-3'>
                  <AttemptTable details={details} />
                </TableCell>
              </TableRow>
            </Fragment>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function AttemptTable({
  details,
}: {
  readonly details: NotificationDeliveryDetails;
}): React.ReactElement {
  if (details.attempts.length === 0) {
    return (
      <p className='text-xs text-muted-foreground'>No attempts recorded.</p>
    );
  }

  return (
    <div>
      <div className='mb-2 text-xs font-medium text-muted-foreground'>
        Provider attempts
      </div>
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
    </div>
  );
}

function StatusBadge({ status }: { readonly status: NotificationStatus }) {
  const tone = statusTone(status);
  return <Badge className={tone.badge}>{status.replace('_', ' ')}</Badge>;
}

function statusTone(status: NotificationStatus): {
  readonly badge: string;
} {
  if (status === 'completed' || status === 'accepted')
    return {
      badge:
        'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
    };
  if (status === 'failed' || status === 'unknown' || status === 'partial')
    return {
      badge: 'border-destructive/20 bg-destructive/10 text-destructive',
    };
  return {
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
