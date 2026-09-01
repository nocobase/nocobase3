import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { useTranslation } from '@nocobase/i18n/client';
import {
  Activity,
  ArrowLeft,
  CheckCircle2,
  CircleDot,
  RotateCcw,
} from 'lucide-react';
import { Link, useParams } from 'react-router';

import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert.js';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog.js';
import { Button } from '../components/ui/button.js';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../components/ui/card.js';
import { Progress, ProgressLabel } from '../components/ui/progress.js';
import {
  ACTIVE_DEPLOYMENT_SEQUENCE,
  cloneDeploymentFixtures,
  createDeploymentEvents,
  createRedeploymentEvent,
  formatDateTime,
  formatDuration,
  getDeploymentProgress,
  nextDeploymentStatus,
  type DeploymentEvent,
  type DeploymentRecord,
  type DeploymentStatus,
  type DeploymentType,
} from '../domain/operations.js';
import { StatusBadge } from './deployments-page.js';

export default function DeploymentDetailPage(): ReactElement {
  const { deploymentId = '' } = useParams<{ deploymentId: string }>();
  const source = useMemo(() => findDeployment(deploymentId), [deploymentId]);
  return <DeploymentDetailContent key={deploymentId} source={source} />;
}

function DeploymentDetailContent({
  source,
}: {
  readonly source: DeploymentRecord | null;
}): ReactElement {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const [deployment, setDeployment] = useState<DeploymentRecord | null>(source);
  const [events, setEvents] = useState<DeploymentEvent[]>(() =>
    source ? createDeploymentEvents(source) : [],
  );
  const [redeployOpen, setRedeployOpen] = useState(false);
  const [announcement, setAnnouncement] = useState<string | null>(null);

  useEffect(() => {
    if (!deployment) return;
    const next = nextDeploymentStatus(deployment.status);
    if (!next || !deployment.id.startsWith('local-redeploy-')) return;
    const timer = window.setTimeout(() => {
      setEvents((current) => {
        const completed = current.map((event, index) =>
          index === current.length - 1 && event.status === 'running'
            ? { ...event, status: 'succeeded' as const }
            : event,
        );
        return [
          ...completed,
          createRedeploymentEvent(deployment.id, next, completed.length),
        ];
      });
      setDeployment((current) => {
        if (!current || current.id !== deployment.id) return current;
        return {
          ...current,
          status: next,
          startedAt:
            current.startedAt ??
            (next === 'preparing' ? new Date().toISOString() : null),
          finishedAt: next === 'succeeded' ? new Date().toISOString() : null,
        };
      });
      if (next === 'succeeded') {
        setAnnouncement(
          t('deployment.redeploy.succeeded', {
            defaultValue: 'Redeployment succeeded',
          }),
        );
      }
    }, 1_100);
    return () => window.clearTimeout(timer);
  }, [deployment, t]);

  if (!deployment) {
    return (
      <main className='mx-auto flex min-h-[60svh] max-w-xl flex-col items-center justify-center px-6 text-center'>
        <Activity
          className='mb-4 size-10 text-muted-foreground'
          aria-hidden='true'
        />
        <h1 className='text-xl font-semibold'>
          {t('deployment.notFound.title', {
            defaultValue: 'Deployment not found',
          })}
        </h1>
        <p className='mt-2 text-sm text-muted-foreground'>
          {t('deployment.notFound.description', {
            defaultValue:
              'This local demo does not contain the requested deployment.',
          })}
        </p>
        <Button
          className='mt-5'
          variant='outline'
          nativeButton={false}
          render={<Link to='/deployments' />}
        >
          {t('deployment.back', { defaultValue: 'Back to deployments' })}
        </Button>
      </main>
    );
  }

  const progress =
    deployment.status === 'failed'
      ? getDeploymentProgress(
          ACTIVE_DEPLOYMENT_SEQUENCE[
            Math.min(events.length - 1, ACTIVE_DEPLOYMENT_SEQUENCE.length - 1)
          ] ?? 'queued',
        )
      : getDeploymentProgress(deployment.status);
  const canRedeploy = ['succeeded', 'failed', 'cancelled'].includes(
    deployment.status,
  );

  const confirmRedeploy = (): void => {
    const local: DeploymentRecord = {
      ...deployment,
      id: `local-redeploy-${deployment.id}`,
      displayId: 'DEP-1050',
      type: 'redeploy',
      status: 'queued',
      previousRelease: deployment.targetRelease,
      requestedBy: 'You',
      createdAt: new Date().toISOString(),
      startedAt: null,
      finishedAt: null,
      failure: undefined,
    };
    setDeployment(local);
    setEvents([createRedeploymentEvent(local.id, 'queued', 0)]);
    setAnnouncement(
      t('deployment.redeploy.queued', { defaultValue: 'Redeployment queued' }),
    );
    setRedeployOpen(false);
  };

  return (
    <main className='min-h-[calc(100svh-4rem)] bg-muted/20'>
      <header className='border-b bg-background px-4 py-6 sm:px-6'>
        <div className='mx-auto w-full max-w-7xl space-y-5'>
          <Button
            variant='ghost'
            size='sm'
            nativeButton={false}
            render={<Link to='/deployments' />}
          >
            <ArrowLeft aria-hidden='true' />
            {t('deployment.back', { defaultValue: 'Back to deployments' })}
          </Button>
          <div className='flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between'>
            <div className='min-w-0'>
              <div className='flex flex-wrap items-center gap-2'>
                <h1 className='break-all text-2xl font-semibold tracking-tight'>
                  {translateValues(t, 'deployment.title', 'Deployment {{id}}', {
                    id: deployment.displayId,
                  })}
                </h1>
                <StatusBadge status={deployment.status} />
              </div>
              <p className='mt-1 text-sm text-muted-foreground'>
                {translateValues(
                  t,
                  'deployment.subtitle',
                  '{{type}} of {{application}} to {{environment}}',
                  {
                    type: typeLabel(deployment.type, t),
                    application: deployment.applicationName,
                    environment: deployment.environment,
                  },
                )}
              </p>
            </div>
            {canRedeploy ? (
              <Button
                type='button'
                variant='outline'
                onClick={() => setRedeployOpen(true)}
              >
                <RotateCcw aria-hidden='true' />
                {t('deployment.redeploy.action', { defaultValue: 'Redeploy' })}
              </Button>
            ) : null}
          </div>
        </div>
      </header>

      <div className='mx-auto w-full max-w-7xl space-y-5 px-4 py-6 sm:px-6'>
        {announcement ? (
          <Alert className='border-primary/30 bg-primary/5' aria-live='polite'>
            <CheckCircle2 aria-hidden='true' />
            <AlertTitle>{announcement}</AlertTitle>
            <AlertDescription>
              {t('deployment.redeploy.localDescription', {
                defaultValue:
                  'This browser-only operation advances locally and resets when the page reloads.',
              })}
            </AlertDescription>
          </Alert>
        ) : null}

        <div className='grid gap-4 sm:grid-cols-3'>
          <SummaryCard
            label={t('deployment.summary.targetRelease', {
              defaultValue: 'Target release',
            })}
            value={deployment.targetRelease}
          />
          <SummaryCard
            label={t('deployment.summary.environment', {
              defaultValue: 'Environment',
            })}
            value={deployment.environment}
          />
          <SummaryCard
            label={t('deployment.summary.requestedBy', {
              defaultValue: 'Requested by',
            })}
            value={deployment.requestedBy}
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>
              {t('deployment.progress.title', {
                defaultValue: 'Deployment progress',
              })}
            </CardTitle>
            <CardDescription aria-live='polite'>
              {translateValues(
                t,
                'deployment.progress.description',
                'Step {{step}} of {{total}} · {{status}}',
                {
                  step: String(
                    Math.min(
                      progress.step + 1,
                      ACTIVE_DEPLOYMENT_SEQUENCE.length,
                    ),
                  ),
                  total: String(ACTIVE_DEPLOYMENT_SEQUENCE.length),
                  status: statusLabel(deployment.status, t),
                },
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Progress value={progress.percent}>
              <ProgressLabel>{statusLabel(deployment.status, t)}</ProgressLabel>
              <span className='ml-auto text-sm text-muted-foreground tabular-nums'>
                {progress.percent}%
              </span>
            </Progress>
          </CardContent>
        </Card>

        {deployment.failure ? (
          <Alert variant='destructive'>
            <Activity aria-hidden='true' />
            <AlertTitle>{deployment.failure.title}</AlertTitle>
            <AlertDescription>
              {deployment.failure.message}{' '}
              <span className='font-mono text-xs'>
                ({deployment.failure.code})
              </span>
            </AlertDescription>
          </Alert>
        ) : null}

        <div className='grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(17rem,1fr)]'>
          <Card>
            <CardHeader>
              <CardTitle>
                {t('deployment.timeline.title', {
                  defaultValue: 'Deployment timeline',
                })}
              </CardTitle>
              <CardDescription>
                {t('deployment.timeline.description', {
                  defaultValue:
                    'Every stage reported by the local deployment simulator.',
                })}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ol
                className='space-y-0'
                aria-label={t('deployment.timeline.aria', {
                  defaultValue: 'Deployment events',
                })}
              >
                {events.map((event, index) => (
                  <li
                    key={event.id}
                    className='relative grid grid-cols-[1.75rem_1fr] gap-3 pb-6 last:pb-0'
                  >
                    {index < events.length - 1 ? (
                      <span
                        className='absolute top-6 bottom-0 left-[0.8125rem] w-px bg-border'
                        aria-hidden='true'
                      />
                    ) : null}
                    <span className='relative z-10 flex size-7 items-center justify-center rounded-full border bg-background'>
                      {event.status === 'succeeded' ? (
                        <CheckCircle2
                          className='size-4 text-primary'
                          aria-hidden='true'
                        />
                      ) : event.status === 'failed' ? (
                        <Activity
                          className='size-4 text-destructive'
                          aria-hidden='true'
                        />
                      ) : (
                        <CircleDot
                          className='size-4 animate-pulse text-primary'
                          aria-hidden='true'
                        />
                      )}
                    </span>
                    <div className='min-w-0'>
                      <div className='flex flex-wrap items-center justify-between gap-2'>
                        <p className='font-medium'>
                          {t(`deployment.event.${event.stage}.title`, {
                            defaultValue: event.message,
                          })}
                        </p>
                        <time
                          className='text-xs text-muted-foreground'
                          dateTime={event.createdAt}
                        >
                          {formatDateTime(event.createdAt, locale)}
                        </time>
                      </div>
                      <p className='mt-1 text-sm text-muted-foreground'>
                        {t(`deployment.event.${event.stage}.description`, {
                          defaultValue: event.detail,
                        })}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>

          <Card className='h-fit'>
            <CardHeader>
              <CardTitle>
                {t('deployment.operation.title', {
                  defaultValue: 'Operation details',
                })}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className='grid gap-4'>
                <Detail
                  label={t('deployment.operation.application', {
                    defaultValue: 'Application',
                  })}
                  value={deployment.applicationName}
                />
                <Detail
                  label={t('deployment.operation.type', {
                    defaultValue: 'Type',
                  })}
                  value={typeLabel(deployment.type, t)}
                />
                <Detail
                  label={t('deployment.operation.previousRelease', {
                    defaultValue: 'Previous release',
                  })}
                  value={
                    deployment.previousRelease ??
                    t('common.none', { defaultValue: 'None' })
                  }
                  mono
                />
                <Detail
                  label={t('deployment.operation.targetRelease', {
                    defaultValue: 'Target release',
                  })}
                  value={deployment.targetRelease}
                  mono
                />
                <Detail
                  label={t('deployment.operation.created', {
                    defaultValue: 'Created',
                  })}
                  value={formatDateTime(deployment.createdAt, locale)}
                />
                <Detail
                  label={t('deployment.operation.started', {
                    defaultValue: 'Started',
                  })}
                  value={formatDateTime(deployment.startedAt, locale)}
                />
                <Detail
                  label={t('deployment.operation.finished', {
                    defaultValue: 'Finished',
                  })}
                  value={formatDateTime(deployment.finishedAt, locale)}
                />
                <Detail
                  label={t('deployment.operation.duration', {
                    defaultValue: 'Duration',
                  })}
                  value={formatDuration(
                    deployment.startedAt,
                    deployment.finishedAt,
                  )}
                />
              </dl>
            </CardContent>
          </Card>
        </div>
      </div>

      <AlertDialog open={redeployOpen} onOpenChange={setRedeployOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('deployment.redeploy.dialogTitle', {
                defaultValue: 'Redeploy release',
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {translateValues(
                t,
                'deployment.redeploy.dialogDescription',
                'Create a new local deployment for release {{release}}. The current record remains in this browser session.',
                { release: deployment.targetRelease },
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {t('common.cancel', { defaultValue: 'Cancel' })}
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmRedeploy}>
              {t('deployment.redeploy.confirm', {
                defaultValue: 'Confirm redeploy',
              })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

function findDeployment(id: string): DeploymentRecord | null {
  const normalized = decodeURIComponent(id).toLocaleLowerCase();
  return (
    cloneDeploymentFixtures().find(
      (deployment) =>
        deployment.id.toLocaleLowerCase() === normalized ||
        deployment.displayId.toLocaleLowerCase() === normalized,
    ) ?? null
  );
}

function SummaryCard({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}): ReactElement {
  return (
    <Card size='sm'>
      <CardContent>
        <p className='text-xs font-medium text-muted-foreground'>{label}</p>
        <p className='mt-1 truncate font-semibold'>{value}</p>
      </CardContent>
    </Card>
  );
}

function Detail({
  label,
  value,
  mono = false,
}: {
  readonly label: string;
  readonly value: string;
  readonly mono?: boolean;
}): ReactElement {
  return (
    <div className='space-y-1'>
      <dt className='text-xs font-medium text-muted-foreground'>{label}</dt>
      <dd
        className={mono ? 'break-all font-mono text-xs' : 'break-words text-sm'}
      >
        {value}
      </dd>
    </div>
  );
}

type Translate = ReturnType<typeof useTranslation>['t'];

function statusLabel(status: DeploymentStatus, t: Translate): string {
  const labels: Record<DeploymentStatus, string> = {
    queued: t('status.queued', { defaultValue: 'Queued' }),
    preparing: t('status.preparing', { defaultValue: 'Preparing' }),
    activating: t('status.activating', { defaultValue: 'Activating' }),
    checking: t('status.checking', { defaultValue: 'Checking' }),
    switching: t('status.switching', { defaultValue: 'Switching' }),
    draining: t('status.draining', { defaultValue: 'Draining' }),
    succeeded: t('status.succeeded', { defaultValue: 'Succeeded' }),
    failed: t('status.failed', { defaultValue: 'Failed' }),
    cancelled: t('status.cancelled', { defaultValue: 'Cancelled' }),
  };
  return labels[status];
}

function typeLabel(type: DeploymentType, t: Translate): string {
  const labels: Record<DeploymentType, string> = {
    deploy: t('deploymentType.deploy', { defaultValue: 'Deploy' }),
    rollback: t('deploymentType.rollback', { defaultValue: 'Rollback' }),
    redeploy: t('deploymentType.redeploy', { defaultValue: 'Redeploy' }),
  };
  return labels[type];
}

function translateValues(
  t: Translate,
  key: string,
  defaultValue: string,
  values: Readonly<Record<string, string>>,
): string {
  const translated = t(key, { defaultValue, ...values });
  return Object.entries(values).reduce(
    (result, [name, value]) => result.replaceAll(`{{${name}}}`, value),
    translated,
  );
}
