import {
  Activity,
  ArrowLeft,
  CheckCircle2,
  Circle,
  Clock3,
  RotateCcw,
  Server,
} from 'lucide-react';
import { useTranslate } from '@refinedev/core';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Progress, ProgressLabel } from '@/components/ui/progress';
import {
  type HubDeployment,
  type HubDeploymentEvent,
  type HubFetcher,
  type HubMe,
  hasHubCapability,
  hubPost,
  useHubQuery,
} from '@/features/hub/api';
import {
  formatHubDate,
  HubEmptyState,
  HubErrorState,
  HubLoadingState,
  HubNotFoundState,
  HubStatusBadge,
} from '@/features/hub/components';
import {
  getDeploymentProgress,
  getDeploymentTypeLabel,
  getStatusLabel,
} from '@/features/hub/status';
import { useOptionalHubRuntime } from '@/features/hub/provider';

export interface DeploymentDetailPageProps {
  deploymentId?: string;
  fetcher?: HubFetcher;
  onRedeploy?: (deployment: HubDeployment) => void;
}

const TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'cancelled']);

export function DeploymentDetailPage({
  deploymentId: deploymentIdProp,
  fetcher,
  onRedeploy,
}: DeploymentDetailPageProps) {
  const translate = useTranslate();
  const params = useParams<{ deploymentId?: string }>();
  const navigate = useNavigate();
  const deploymentId = deploymentIdProp ?? params.deploymentId;
  const encodedId = deploymentId ? encodeURIComponent(deploymentId) : null;
  const deployment = useHubQuery<HubDeployment>({
    path: encodedId ? `/deployments/${encodedId}` : null,
    fetcher,
  });
  const events = useHubQuery<HubDeploymentEvent[]>({
    path: encodedId ? `/deployments/${encodedId}/events` : null,
    fetcher,
    initialData: [],
    transform: (value) =>
      [...value].sort((left, right) => left.sequence - right.sequence),
  });
  const runtime = useOptionalHubRuntime();
  const me = useHubQuery<HubMe>({
    path: encodedId && !runtime ? '/me' : null,
    fetcher,
    enabled: Boolean(encodedId && !runtime),
  });
  const canRedeploy = hasHubCapability(
    runtime?.me.capabilities ?? me.data?.capabilities,
    'hub.deployment',
    'create',
    deployment.data?.applicationId,
  );
  const capabilities = runtime?.me.capabilities ?? me.data?.capabilities;
  const deploymentStatus = deployment.data?.status;
  const reloadDeployment = deployment.reload;
  const reloadEvents = events.reload;
  const [redeployOpen, setRedeployOpen] = useState(false);
  const [redeploying, setRedeploying] = useState(false);
  const [redeployError, setRedeployError] = useState<Error | null>(null);

  useEffect(() => {
    if (!deploymentStatus || TERMINAL_STATUSES.has(deploymentStatus)) return;
    const timer = window.setInterval(() => {
      reloadDeployment();
      reloadEvents();
    }, 2_000);
    return () => window.clearInterval(timer);
  }, [deploymentStatus, reloadDeployment, reloadEvents]);

  const deploymentKind = translate('hub.deployment.notFoundKind', 'Deployment');
  if (!deploymentId) return <HubNotFoundState kind={deploymentKind} />;
  if (deployment.loading) {
    return (
      <HubLoadingState
        label={translate('hub.deployment.loading', 'Loading deployment')}
      />
    );
  }
  if (deployment.error) {
    return (
      <HubErrorState
        error={deployment.error}
        onRetry={deployment.reload}
        title={translate(
          'hub.deployment.loadError',
          'Unable to load deployment',
        )}
      />
    );
  }
  if (!deployment.data) return <HubNotFoundState kind={deploymentKind} />;
  const deploymentData = deployment.data;
  const canReadGlobalDeployments = hasHubCapability(
    capabilities,
    'hub.deployment',
    'read',
  );
  const canReadApplication = hasHubCapability(
    capabilities,
    'hub.app',
    'read',
    deploymentData.applicationId,
  );
  const backTarget = canReadGlobalDeployments
    ? {
        label: translate('hub.common.deployments', 'Deployments'),
        to: '/deployments',
      }
    : canReadApplication
      ? {
          label: translate('hub.common.application', 'Application'),
          to: `/apps/${encodeURIComponent(deploymentData.applicationId)}`,
        }
      : { label: translate('hub.common.home', 'Home'), to: '/' };

  const progress = getDeploymentProgress(deploymentData.status, translate);
  const failure =
    deploymentData.failure ??
    (deploymentData.failureCode || deploymentData.failureMessage
      ? {
          code: deploymentData.failureCode ?? 'DEPLOYMENT_FAILED',
          message:
            deploymentData.failureMessage ??
            translate('hub.deployment.failure.default', 'Deployment failed.'),
        }
      : null);

  return (
    <div className='space-y-6'>
      <header className='space-y-4'>
        <Button
          variant='ghost'
          size='sm'
          nativeButton={false}
          render={<Link to={backTarget.to} />}
        >
          <ArrowLeft aria-hidden='true' />
          {backTarget.label}
        </Button>
        <div className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
          <div className='space-y-1'>
            <div className='flex flex-wrap items-center gap-2'>
              <h1 className='font-heading text-2xl font-semibold tracking-tight'>
                {translateWithValues(
                  translate,
                  'hub.deployment.title',
                  'Deployment {{id}}',
                  { id: deploymentData.id },
                )}
              </h1>
              <HubStatusBadge status={deploymentData.status} />
            </div>
            <p className='text-sm text-muted-foreground'>
              {translateWithValues(
                translate,
                'hub.deployment.subtitle',
                '{{type}} to {{environment}}',
                {
                  type: getDeploymentTypeLabel(deploymentData.type, translate),
                  environment: deploymentData.environmentId,
                },
              )}
            </p>
          </div>
          {canRedeploy && TERMINAL_STATUSES.has(deploymentData.status) ? (
            <Button
              type='button'
              variant='outline'
              onClick={() => {
                if (onRedeploy) {
                  onRedeploy(deploymentData);
                } else {
                  setRedeployError(null);
                  setRedeployOpen(true);
                }
              }}
            >
              <RotateCcw aria-hidden='true' />
              {translate('hub.deployment.redeploy', 'Redeploy')}
            </Button>
          ) : null}
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>
            {translate('hub.deployment.progress.title', 'Deployment progress')}
          </CardTitle>
          <CardDescription aria-live='polite'>
            {translateWithValues(
              translate,
              'hub.deployment.progress.description',
              '{{status}}. Event history refreshes while the deployment is running.',
              { status: progress.label },
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Progress value={progress.percent}>
            <ProgressLabel>{progress.label}</ProgressLabel>
            <span className='ml-auto text-sm tabular-nums text-muted-foreground'>
              {progress.percent}%
            </span>
          </Progress>
        </CardContent>
      </Card>

      {failure ? (
        <Alert variant='destructive'>
          <Activity aria-hidden='true' />
          <AlertTitle>{failure.code}</AlertTitle>
          <AlertDescription>{failure.message}</AlertDescription>
        </Alert>
      ) : null}

      <div className='grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(16rem,1fr)]'>
        <Card>
          <CardHeader>
            <CardTitle>
              {translate('hub.deployment.timeline.title', 'Event timeline')}
            </CardTitle>
            <CardDescription>
              {translate(
                'hub.deployment.timeline.description',
                'Persisted stages reported by the Hub deployment orchestrator.',
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {events.error ? (
              <HubErrorState
                error={events.error}
                onRetry={events.reload}
                title={translate(
                  'hub.deployment.events.loadError',
                  'Unable to load events',
                )}
              />
            ) : events.loading ? (
              <HubLoadingState
                label={translate(
                  'hub.deployment.events.loading',
                  'Loading deployment events',
                )}
              />
            ) : (events.data?.length ?? 0) === 0 ? (
              <HubEmptyState
                title={translate(
                  'hub.deployment.events.empty.title',
                  'Waiting for events',
                )}
                description={translate(
                  'hub.deployment.events.empty.description',
                  'The orchestrator has not persisted an execution event yet.',
                )}
              />
            ) : (
              <DeploymentTimeline events={events.data ?? []} />
            )}
          </CardContent>
        </Card>

        <Card className='h-fit'>
          <CardHeader>
            <CardTitle>
              {translate('hub.deployment.details.title', 'Operation details')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className='grid gap-4 text-sm'>
              <Detail
                label={translate('hub.common.application', 'Application')}
                value={deploymentData.applicationId}
              />
              <Detail
                label={translate(
                  'hub.deployment.details.targetRelease',
                  'Target release',
                )}
                value={deploymentData.targetReleaseId}
                mono
              />
              <Detail
                label={translate(
                  'hub.deployment.details.previousRelease',
                  'Previous release',
                )}
                value={
                  deploymentData.previousReleaseId ??
                  translate('hub.common.none', 'None')
                }
                mono
              />
              <Detail
                label={translate('hub.common.environment', 'Environment')}
                value={deploymentData.environmentId}
              />
              <Detail
                label={translate(
                  'hub.deployment.details.requestedBy',
                  'Requested by',
                )}
                value={deploymentData.requestedBy}
              />
              <Detail
                label={translate('hub.common.started', 'Started')}
                value={formatHubDate(deploymentData.startedAt)}
              />
              <Detail
                label={translate('hub.common.finished', 'Finished')}
                value={formatHubDate(deploymentData.finishedAt)}
              />
              <Detail
                label={translate(
                  'hub.deployment.details.hostOperation',
                  'Host operation',
                )}
                value={deploymentData.hostOperationId ?? '—'}
                mono
              />
            </dl>
          </CardContent>
        </Card>
      </div>
      <AlertDialog
        open={redeployOpen}
        onOpenChange={(open) => {
          if (!open && !redeploying) {
            setRedeployOpen(false);
            setRedeployError(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {translate(
                'hub.deployment.redeployDialog.title',
                'Redeploy release',
              )}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {translateWithValues(
                translate,
                'hub.deployment.redeployDialog.description',
                'Create a new Deployment for release {{release}} in {{environment}}. The existing record remains unchanged.',
                {
                  release: deploymentData.targetReleaseId,
                  environment: deploymentData.environmentId,
                },
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {redeployError ? (
            <Alert variant='destructive'>
              <AlertTitle>
                {translate(
                  'hub.deployment.redeployDialog.error',
                  'Unable to redeploy release',
                )}
              </AlertTitle>
              <AlertDescription>{redeployError.message}</AlertDescription>
            </Alert>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={redeploying}>
              {translate('hub.common.cancel', 'Cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={redeploying}
              onClick={(event) => {
                event.preventDefault();
                setRedeploying(true);
                setRedeployError(null);
                void hubPost<HubDeployment>(
                  `/apps/${encodeURIComponent(
                    deploymentData.applicationId,
                  )}/deployments`,
                  {
                    targetReleaseId: deploymentData.targetReleaseId,
                    type: 'redeploy',
                  },
                  fetcher,
                )
                  .then((result) => {
                    setRedeployOpen(false);
                    void navigate(`/deployments/${result.data.id}`);
                  })
                  .catch((reason: unknown) => {
                    setRedeployError(
                      reason instanceof Error
                        ? reason
                        : new Error(String(reason)),
                    );
                  })
                  .finally(() => setRedeploying(false));
              }}
            >
              {redeploying
                ? translate('hub.common.starting', 'Starting…')
                : translate(
                    'hub.deployment.redeployDialog.confirm',
                    'Confirm redeploy',
                  )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function DeploymentTimeline({ events }: { events: HubDeploymentEvent[] }) {
  const translate = useTranslate();
  return (
    <ol
      className='relative space-y-0'
      aria-label={translate('hub.deployment.events.aria', 'Deployment events')}
    >
      {events.map((event, index) => {
        const complete = event.status === 'succeeded';
        return (
          <li
            key={event.id}
            className='relative grid grid-cols-[1.5rem_1fr] gap-3 pb-6 last:pb-0'
          >
            {index < events.length - 1 ? (
              <span
                className='absolute top-5 bottom-0 left-[0.6875rem] w-px bg-border'
                aria-hidden='true'
              />
            ) : null}
            <span className='relative z-10 mt-0.5 flex size-6 items-center justify-center rounded-full border bg-background'>
              {complete ? (
                <CheckCircle2
                  className='size-4 text-primary'
                  aria-hidden='true'
                />
              ) : (
                <Circle
                  className='size-3 text-muted-foreground'
                  aria-hidden='true'
                />
              )}
            </span>
            <div className='min-w-0 space-y-1'>
              <div className='flex flex-wrap items-center justify-between gap-2'>
                <p className='font-medium'>
                  {event.message ?? getStatusLabel(event.type, translate)}
                </p>
                <time
                  className='text-xs text-muted-foreground'
                  dateTime={event.createdAt}
                >
                  {formatHubDate(event.createdAt)}
                </time>
              </div>
              <div className='flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground'>
                <span>{getStatusLabel(event.status, translate)}</span>
                {event.hostId ? (
                  <span className='inline-flex items-center gap-1'>
                    <Server className='size-3' aria-hidden='true' />
                    {event.hostId}
                  </span>
                ) : null}
                {event.runtimeId ? (
                  <span className='inline-flex items-center gap-1 font-mono'>
                    <Clock3 className='size-3' aria-hidden='true' />
                    {event.runtimeId}
                  </span>
                ) : null}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function Detail({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className='space-y-1'>
      <dt className='text-xs text-muted-foreground'>{label}</dt>
      <dd
        className={
          mono ? 'break-all font-mono text-xs' : 'break-words font-medium'
        }
      >
        {value}
      </dd>
    </div>
  );
}

function translateWithValues(
  translate: ReturnType<typeof useTranslate>,
  key: string,
  fallback: string,
  values: Record<string, string>,
): string {
  const translated = translate(key, values, fallback);
  return Object.entries(values).reduce(
    (result, [name, value]) => result.replaceAll(`{{${name}}}`, value),
    translated,
  );
}

export default DeploymentDetailPage;
