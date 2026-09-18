import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useEffect, useRef, useState, type ReactElement } from 'react';
import { Button } from '../../components/ui/button.js';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog.js';
import type { ApiResponse, DeploymentRecord } from './types.js';
import { StatusBadge } from './shared.js';
import { deploymentPhaseLabel } from './utils.js';
import enUS from '../../locales/en-US.js';

interface Event {
  readonly sequence: number;
  readonly at: string;
  readonly phase: string;
  readonly status: DeploymentRecord['status'];
  readonly code?: string;
  readonly failedPhase?: string;
  readonly message?: string;
  readonly durationMs?: number;
}
interface EventsPage {
  readonly items: readonly Event[];
  readonly status: DeploymentRecord['status'];
  readonly nextCursor: number;
  readonly truncated: boolean;
  readonly legacy: boolean;
}

export function DeploymentLogs({
  appId,
  deployment,
  onClose,
}: {
  readonly appId: string;
  readonly deployment: DeploymentRecord;
  readonly onClose: () => void;
}): ReactElement {
  const client = useApiClient();
  const { t, i18n } = useTranslation('@nocobase/app-plugin-hub');
  const logViewportRef = useRef<HTMLDivElement>(null);
  const [following, setFollowing] = useState(true);
  const [events, setEvents] = useState<readonly Event[]>([]);
  const [status, setStatus] = useState(deployment.status);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const [legacy, setLegacy] = useState(false);
  const [retry, setRetry] = useState(0);
  const [copyState, setCopyState] = useState<'copied' | 'copyFailed'>();
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cursor = 0;
    const load = async (): Promise<void> => {
      try {
        const { data } = await client.request<ApiResponse<EventsPage>>({
          path: `hub/apps/${appId}/deployments/${deployment.id}/logs`,
          query: { after: cursor },
        });
        if (cancelled) return;
        cursor = data.nextCursor;
        setEvents((previous) =>
          [
            ...previous,
            ...data.items.filter(
              (item) =>
                !previous.some((event) => event.sequence === item.sequence),
            ),
          ].slice(-64),
        );
        setStatus(data.status);
        setLegacy(data.legacy);
        setTruncated((previous) => previous || data.truncated);
        setLoaded(true);
        if (data.status === 'queued' || data.status === 'deploying')
          timer = setTimeout(() => void load(), 2000);
      } catch {
        if (!cancelled) setFailed(true);
      }
    };
    void load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [appId, client, deployment.id, retry]);
  useEffect(() => {
    const viewport = logViewportRef.current;
    if (following && viewport) viewport.scrollTop = viewport.scrollHeight;
  }, [events, following]);
  const durationMs =
    events.length > 1
      ? Math.max(
          0,
          Date.parse(events[events.length - 1].at) - Date.parse(events[0].at),
        )
      : 0;
  const hasExecutionDetails = events.some((event) => event.message);
  const terminalFailure = events.at(-1);
  const detailedFailure =
    terminalFailure?.status === 'failed' && !terminalFailure.message
      ? [...events]
          .reverse()
          .find(
            (event) =>
              event.status === 'failed' &&
              event.message &&
              event.phase === terminalFailure.failedPhase,
          )
      : undefined;
  const visibleEvents = events
    .filter(
      (event) =>
        (!hasExecutionDetails ||
          event.message ||
          event.status !== 'deploying') &&
        !(detailedFailure && event === terminalFailure),
    )
    .map((event) =>
      event === detailedFailure
        ? { ...event, code: terminalFailure?.code ?? event.code }
        : event,
    );
  const logText = [
    `App: ${appId}`,
    `Deployment: ${deployment.id}`,
    `Release: ${deployment.releaseId}`,
    ...events.map(
      (event) =>
        `${event.at} ${event.phase} ${event.status}${event.code ? ` ${event.code}` : ''}${event.message ? ` ${event.message}` : ''}${event.durationMs !== undefined ? ` (${event.durationMs} ms)` : ''}`,
    ),
  ].join('\n');
  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(logText);
      setCopyState('copied');
    } catch {
      setCopyState('copyFailed');
    }
  };
  const download = (): void => {
    const url = URL.createObjectURL(
      new Blob([logText], { type: 'text/plain;charset=utf-8' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `deployment-${deployment.id}.log`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className='top-0 right-0 left-auto h-svh max-h-svh w-full max-w-5xl translate-x-0 translate-y-0 rounded-none'>
        <DialogHeader className='mb-4 space-y-2 border-b pb-4 pr-8'>
          <DialogTitle>
            {t('deploymentLogs.title', { defaultValue: 'Deployment logs' })}
          </DialogTitle>
          <DialogDescription>
            {appId} · {deployment.release?.version ?? deployment.releaseId}
          </DialogDescription>
          <p className='break-all font-mono text-xs text-muted-foreground'>
            {deployment.id}
          </p>
          <div className='flex flex-wrap items-center gap-3'>
            <div role='status'>
              <StatusBadge state={status} />
            </div>
            {loaded &&
            status !== 'queued' &&
            status !== 'deploying' &&
            events.length > 1 ? (
              <span className='text-xs text-muted-foreground'>
                {t('deploymentLogs.duration', {
                  defaultValue: 'Recorded duration: {{seconds}} s',
                  seconds: (durationMs / 1000).toFixed(2),
                })}
              </span>
            ) : null}
          </div>
        </DialogHeader>
        <DialogBody className='flex flex-col gap-3 overflow-hidden'>
          <p className='text-xs leading-5 text-muted-foreground'>
            {t('deploymentLogs.scope', {
              defaultValue:
                'Deployment steps and outcomes. Application runtime logs are not included.',
            })}
          </p>
          {failed ? (
            <div role='alert'>
              <p>
                {t('deploymentLogs.loadFailed', {
                  defaultValue:
                    'Could not load logs. Check your access or connection and try again.',
                })}
              </p>
              <Button
                variant='outline'
                onClick={() => {
                  setEvents([]);
                  setLoaded(false);
                  setFailed(false);
                  setTruncated(false);
                  setRetry((value) => value + 1);
                }}
              >
                {t('deploymentLogs.retry', { defaultValue: 'Retry' })}
              </Button>
            </div>
          ) : !loaded ? (
            <p role='status'>
              {t('deploymentLogs.loading', { defaultValue: 'Loading logs…' })}
            </p>
          ) : null}
          {loaded && !events.length ? (
            <p>
              {t(legacy ? 'deploymentLogs.legacy' : 'deploymentLogs.empty', {
                defaultValue: legacy
                  ? 'This deployment predates log collection. No historical events are available.'
                  : 'No deployment events recorded.',
              })}
            </p>
          ) : null}
          {truncated ? (
            <p>
              {t('deploymentLogs.truncated', {
                defaultValue:
                  'Only the latest 64 events are retained for this deployment.',
              })}
            </p>
          ) : null}
          <div
            ref={logViewportRef}
            tabIndex={0}
            role='region'
            aria-label={t('deploymentLogs.output', {
              defaultValue: 'Log output',
            })}
            onScroll={(event) => {
              const viewport = event.currentTarget;
              setFollowing(
                viewport.scrollHeight -
                  viewport.scrollTop -
                  viewport.clientHeight <=
                  32,
              );
            }}
            className='min-h-0 flex-1 overflow-auto rounded-md border border-zinc-800 bg-zinc-950 p-4 text-zinc-200 outline-none focus-visible:ring-2 focus-visible:ring-ring'
          >
            <ol className='font-mono text-xs leading-5'>
              {visibleEvents.map((event) => (
                <li
                  key={event.sequence}
                  className={`grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 px-1 ${event.status === 'failed' ? 'bg-red-950/60 text-red-300' : ''}`}
                >
                  <time
                    className='select-none tabular-nums text-zinc-500'
                    dateTime={event.at}
                    title={event.at}
                  >
                    {new Intl.DateTimeFormat(i18n.language, {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                      fractionalSecondDigits: 3,
                      hour12: false,
                    }).format(new Date(event.at))}
                  </time>
                  <div className='min-w-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere]'>
                    {event.message ??
                      (event.phase === event.status ||
                      event.phase === 'completed'
                        ? enUS.deploymentLogs.states[event.status]
                        : `${deploymentPhaseLabel(event.failedPhase ?? event.phase)}: ${enUS.deploymentLogs.states[event.status]}`)}
                    {event.durationMs !== undefined ? (
                      <span className='ml-2 text-zinc-500'>
                        ({event.durationMs} ms)
                      </span>
                    ) : null}
                    {event.code ? (
                      <span className='block'>
                        {event.code}
                        {!event.message ? (
                          <>
                            {' '}
                            ·{' '}
                            {Object.entries(enUS.deploymentLogs.codes).find(
                              ([key]) =>
                                key ===
                                event.code
                                  ?.toLowerCase()
                                  .replace(/_([a-z])/g, (_, letter: string) =>
                                    letter.toUpperCase(),
                                  ),
                            )?.[1] ??
                              enUS.deploymentLogs.codes.deploymentFailed}
                          </>
                        ) : null}
                      </span>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </DialogBody>
        <div className='mt-4 flex flex-wrap items-center gap-2 border-t pt-4'>
          <Button
            variant='outline'
            disabled={!events.length}
            onClick={() => void copy()}
          >
            {t('deploymentLogs.copy', { defaultValue: 'Copy diagnostics' })}
          </Button>
          <Button
            variant='outline'
            disabled={!events.length}
            onClick={download}
          >
            {t('deploymentLogs.download', { defaultValue: 'Download logs' })}
          </Button>
          <span role='status' className='ml-3 text-sm'>
            {copyState
              ? t(`deploymentLogs.${copyState}`, {
                  defaultValue:
                    copyState === 'copied'
                      ? 'Copied'
                      : 'Could not copy. Select the text manually.',
                })
              : ''}
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
