import { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Check,
  CheckCircle2,
  CircleDot,
  Clock3,
  PackageCheck,
  RefreshCw,
  RotateCcw,
  Rocket,
  Server,
  XCircle,
} from 'lucide-react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { AppAccessActions } from '@/features/apps/app-access-actions';
import type {
  AppReleaseOverview,
  DeploymentKind,
  DeploymentRecord,
  ReleaseOverview,
  ReleaseSummary,
} from '@nocobase/hub-release-management/types';
import {
  getReleaseAction,
  isReadinessBlocked,
} from '@nocobase/hub-release-management/client';

export interface ReleaseManagementDashboardProps {
  overview: ReleaseOverview;
  scope?: 'hub' | 'app';
  busy?: boolean;
  error?: string | null;
  onRefresh: () => void;
  onExecute: (input: {
    appId: string;
    releaseId: string;
    kind: DeploymentKind;
  }) => void;
}

type PendingReleaseAction = {
  app: AppReleaseOverview;
  release: ReleaseSummary;
  kind: DeploymentKind;
};

export function ReleaseManagementDashboard({
  overview,
  scope = 'hub',
  busy = false,
  error,
  onRefresh,
  onExecute,
}: ReleaseManagementDashboardProps) {
  const [selectedAppId, setSelectedAppId] = useState(() =>
    getDefaultAppId(overview.apps),
  );
  const [pendingReleaseAction, setPendingReleaseAction] =
    useState<PendingReleaseAction | null>(null);

  useEffect(() => {
    if (!overview.apps.some((app) => app.id === selectedAppId)) {
      setSelectedAppId(getDefaultAppId(overview.apps));
    }
  }, [overview.apps, selectedAppId]);

  const selectedApp =
    overview.apps.find((app) => app.id === selectedAppId) ?? overview.apps[0];
  const deployments = selectedApp
    ? overview.deployments.filter(
        (deployment) => deployment.appId === selectedApp.id,
      )
    : overview.deployments;
  const appScoped = scope === 'app';
  const deployedApps = overview.apps.filter(
    (app) => app.activeReleaseId,
  ).length;
  const runningApps = overview.apps.filter(
    (app) => app.runtimeState === 'active',
  ).length;
  const failedDeployments = overview.deployments.filter(
    (deployment) => deployment.status === 'failed',
  ).length;

  return (
    <div className='space-y-6'>
      <section className='relative overflow-hidden rounded-2xl border bg-[radial-gradient(circle_at_top_right,color-mix(in_oklch,var(--primary)_10%,transparent),transparent_45%),linear-gradient(135deg,var(--card),color-mix(in_oklch,var(--muted)_55%,var(--card)))] p-6 shadow-sm md:p-8'>
        <div className='absolute -right-16 -top-20 size-64 rounded-full border border-primary/10' />
        <div className='relative flex flex-col justify-between gap-6 lg:flex-row lg:items-end'>
          <div className='max-w-3xl space-y-4'>
            <Badge
              variant='outline'
              className='h-7 gap-1.5 bg-background/70 px-3'
            >
              <Rocket /> 部署与运行
            </Badge>
            <div>
              <h1 className='font-heading text-3xl font-semibold tracking-tight md:text-4xl'>
                {appScoped
                  ? `部署 ${selectedApp?.name ?? '当前 App'}`
                  : '部署构建产物'}
              </h1>
              <p className='mt-3 max-w-2xl text-sm leading-6 text-muted-foreground md:text-base'>
                选择构建产物进行部署，并查看应用运行结果。
              </p>
            </div>
          </div>
          <Button
            variant='outline'
            size='lg'
            className='w-fit bg-background/75'
            disabled={busy}
            onClick={onRefresh}
          >
            <RefreshCw className={cn(busy && 'animate-spin')} />
            刷新状态
          </Button>
        </div>
      </section>

      {error ? (
        <Alert variant='destructive'>
          <AlertCircle />
          <AlertTitle>无法读取部署状态</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {!appScoped ? (
        <section className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
          <MetricCard label='应用' value={overview.apps.length} icon={Server} />
          <MetricCard label='已部署' value={deployedApps} icon={PackageCheck} />
          <MetricCard
            label='运行中'
            value={runningApps}
            icon={CheckCircle2}
            tone='success'
          />
          <MetricCard
            label='部署失败'
            value={failedDeployments}
            icon={AlertCircle}
            tone={failedDeployments ? 'danger' : 'default'}
          />
        </section>
      ) : null}

      {overview.apps.length === 0 ? (
        <EmptyArtifacts />
      ) : (
        <div className='space-y-6'>
          {!appScoped ? (
            <div className='flex gap-2 overflow-x-auto pb-1'>
              {overview.apps.map((app) => (
                <Button
                  key={app.id}
                  variant={app.id === selectedApp?.id ? 'default' : 'outline'}
                  onClick={() => setSelectedAppId(app.id)}
                >
                  <CircleDot />
                  {app.name}
                </Button>
              ))}
            </div>
          ) : null}

          {selectedApp ? (
            <>
              <CurrentDeployment app={selectedApp} />
              <Card>
                <CardHeader className='border-b'>
                  <CardTitle>已接收的构建产物</CardTitle>
                  <CardDescription>
                    App Host 已发现、可由 Hub 部署的不可变产物。
                  </CardDescription>
                  <CardAction>
                    <Badge variant='secondary'>
                      {selectedApp.releases.length} 个产物
                    </Badge>
                  </CardAction>
                </CardHeader>
                <CardContent>
                  {selectedApp.releases.length ? (
                    <div className='divide-y overflow-hidden rounded-xl border bg-card'>
                      {sortArtifacts(selectedApp.releases).map((release) => {
                        const action = getReleaseAction(selectedApp, release);
                        return (
                          <ArtifactRow
                            key={release.id}
                            release={release}
                            active={action === null}
                            action={action}
                            busy={busy}
                            onExecute={() =>
                              action &&
                              setPendingReleaseAction({
                                app: selectedApp,
                                release,
                                kind: action,
                              })
                            }
                          />
                        );
                      })}
                    </div>
                  ) : (
                    <div className='grid min-h-36 place-items-center text-center text-sm text-muted-foreground'>
                      还没有可部署的构建产物。
                    </div>
                  )}
                </CardContent>
              </Card>
              <DeploymentTimeline deployments={deployments} />
            </>
          ) : null}
        </div>
      )}

      <ReleaseActionConfirmation
        action={pendingReleaseAction}
        busy={busy}
        onCancel={() => setPendingReleaseAction(null)}
        onConfirm={() => {
          if (!pendingReleaseAction) return;
          onExecute({
            appId: pendingReleaseAction.app.id,
            releaseId: pendingReleaseAction.release.id,
            kind: pendingReleaseAction.kind,
          });
          setPendingReleaseAction(null);
        }}
      />
    </div>
  );
}

function MetricCard({
  label,
  value,
  icon: Icon,
  tone = 'default',
}: {
  label: string;
  value: number;
  icon: typeof Server;
  tone?: 'default' | 'success' | 'danger';
}) {
  return (
    <Card size='sm'>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardAction>
          <div
            className={cn(
              'grid size-8 place-items-center rounded-lg bg-muted text-muted-foreground',
              tone === 'success' &&
                'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
              tone === 'danger' && 'bg-destructive/10 text-destructive',
            )}
          >
            <Icon className='size-4' />
          </div>
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className='text-3xl font-semibold tabular-nums'>{value}</div>
      </CardContent>
    </Card>
  );
}

function CurrentDeployment({ app }: { app: AppReleaseOverview }) {
  const deployed = Boolean(app.activeReleaseId);
  return (
    <Card>
      <CardContent className='flex flex-col justify-between gap-4 py-1 sm:flex-row sm:items-center'>
        <div className='flex items-center gap-3'>
          <div
            className={cn(
              'grid size-11 place-items-center rounded-xl text-white shadow-sm',
              deployed ? 'bg-emerald-600' : 'bg-muted-foreground',
            )}
          >
            {deployed ? <CheckCircle2 /> : <Clock3 />}
          </div>
          <div>
            <div className='flex flex-wrap items-center gap-2'>
              <span className='font-medium'>{app.name}</span>
              <Badge variant={deployed ? 'default' : 'outline'}>
                {app.runtimeState === 'active'
                  ? '运行中'
                  : app.desiredState === 'stopped'
                    ? '已停止'
                    : deployed
                      ? '已部署'
                      : '未部署'}
              </Badge>
            </div>
            <p className='mt-1 text-xs text-muted-foreground'>
              {app.activeReleaseId
                ? `当前产物 ${app.activeReleaseId} · ${app.activeVersion ?? '版本未知'}`
                : '尚未部署任何构建产物'}
            </p>
          </div>
        </div>
        <AppAccessActions
          accessUrl={app.accessUrl}
          size='sm'
          variant='outline'
        />
      </CardContent>
    </Card>
  );
}

function ArtifactRow({
  release,
  active,
  action,
  busy,
  onExecute,
}: {
  release: ReleaseSummary;
  active: boolean;
  action: DeploymentKind | null;
  busy: boolean;
  onExecute: () => void;
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between',
        active && 'bg-emerald-500/[0.045]',
      )}
    >
      <div className='flex min-w-0 items-start gap-3'>
        <div
          className={cn(
            'mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg border bg-muted/50',
            active &&
              'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
          )}
        >
          {active ? <Check /> : <PackageCheck />}
        </div>
        <div className='min-w-0'>
          <div className='flex flex-wrap items-center gap-2'>
            <span className='font-mono text-sm font-medium'>
              {release.version}
            </span>
            <span className='truncate text-xs text-muted-foreground'>
              {release.id}
            </span>
            {active ? <Badge>当前运行</Badge> : null}
            {action === 'rollback' ? (
              <Badge variant='outline'>历史产物</Badge>
            ) : null}
          </div>
          <p className='mt-1.5 text-xs text-muted-foreground'>
            {formatDate(release.createdAt)}
          </p>
        </div>
      </div>
      {action === 'deploy' ? (
        <Button disabled={busy} onClick={onExecute}>
          <Rocket /> 部署此产物
        </Button>
      ) : action === 'rollback' ? (
        <Button variant='outline' disabled={busy} onClick={onExecute}>
          <RotateCcw /> 回滚到此版本
        </Button>
      ) : null}
    </div>
  );
}

function DeploymentTimeline({
  deployments,
}: {
  deployments: DeploymentRecord[];
}) {
  return (
    <Card>
      <CardHeader className='border-b'>
        <CardTitle>部署记录</CardTitle>
        <CardDescription>
          记录构建产物、操作人、执行结果和最终运行状态。
        </CardDescription>
      </CardHeader>
      <CardContent>
        {deployments.length === 0 ? (
          <div className='grid min-h-32 place-items-center text-center text-sm text-muted-foreground'>
            完成首次部署后，记录会出现在这里。
          </div>
        ) : (
          <div className='space-y-3'>
            {deployments.map((deployment) => (
              <DeploymentItem key={deployment.id} deployment={deployment} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DeploymentItem({ deployment }: { deployment: DeploymentRecord }) {
  const failed = deployment.status === 'failed';
  const pending = deployment.status === 'pending';
  const unchanged = deployment.status === 'unchanged';
  const Icon = failed ? XCircle : pending ? Clock3 : CheckCircle2;
  return (
    <div
      className={cn(
        'rounded-xl border p-4',
        failed && 'border-destructive/20 bg-destructive/[0.035]',
      )}
    >
      <div className='flex items-start gap-3'>
        <Icon
          className={cn(
            'mt-0.5 size-5 shrink-0 text-emerald-600',
            failed && 'text-destructive',
            pending && 'animate-pulse text-amber-600',
          )}
        />
        <div className='min-w-0 flex-1'>
          <div className='flex flex-wrap items-center gap-2'>
            <span className='font-medium'>
              {deployment.kind === 'rollback' ? '回滚' : '部署'}{' '}
              {deployment.releaseId}
            </span>
            <DeploymentStatusBadge deployment={deployment} />
          </div>
          <div className='mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground'>
            <span>{formatDate(deployment.requestedAt)}</span>
            <span>{deployment.actor.name}</span>
            <span className='font-mono'>{deployment.idempotencyKey}</span>
          </div>
          {failed ? (
            <p className='mt-3 text-xs font-medium text-destructive'>
              {deployment.error?.code}: {deployment.error?.message}
              {isReadinessBlocked(deployment) ? '；产物未接管流量' : ''}
            </p>
          ) : (
            <div className='mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground'>
              <span>{deployment.previousReleaseId ?? '未部署'}</span>
              <ArrowRight className='size-3.5' />
              <span className='font-medium text-foreground'>
                {deployment.activeReleaseId ?? '—'}
              </span>
              {unchanged ? <span>（无变化）</span> : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DeploymentStatusBadge({
  deployment,
}: {
  deployment: DeploymentRecord;
}) {
  if (deployment.status === 'failed') {
    return <Badge variant='destructive'>失败</Badge>;
  }
  if (deployment.status === 'pending') {
    return <Badge variant='secondary'>执行中</Badge>;
  }
  if (deployment.status === 'unchanged') {
    return <Badge variant='outline'>无变化</Badge>;
  }
  return <Badge className='bg-emerald-600 text-white'>成功</Badge>;
}

function ReleaseActionConfirmation({
  action,
  busy,
  onCancel,
  onConfirm,
}: {
  action: PendingReleaseAction | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog
      open={Boolean(action)}
      onOpenChange={(open) => !open && onCancel()}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia>
            {action?.kind === 'rollback' ? <RotateCcw /> : <Rocket />}
          </AlertDialogMedia>
          <AlertDialogTitle>
            {action?.kind === 'rollback'
              ? '确认回滚运行版本'
              : '确认部署构建产物'}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {action
              ? action.kind === 'rollback'
                ? `${action.app.name} 将回滚到 ${action.release.id}。Hub 会先启动并检查该版本，成功后才切换流量。`
                : `${action.app.name} 将部署 ${action.release.id}。Hub 会校验产物并在启动成功后更新运行状态。`
              : ''}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>取消</AlertDialogCancel>
          <AlertDialogAction disabled={busy} onClick={onConfirm}>
            {action?.kind === 'rollback' ? <RotateCcw /> : <Rocket />}
            {action?.kind === 'rollback' ? '确认回滚' : '开始部署'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function EmptyArtifacts() {
  return (
    <Card>
      <CardContent className='grid min-h-72 place-items-center py-12 text-center'>
        <div className='max-w-lg'>
          <div className='mx-auto grid size-14 place-items-center rounded-2xl bg-muted'>
            <PackageCheck className='size-7 text-muted-foreground' />
          </div>
          <h2 className='mt-4 text-lg font-medium'>等待部署首个 App</h2>
          <p className='mt-2 text-sm leading-6 text-muted-foreground'>
            从 App 项目完成构建并将产物部署到 Hub 后，应用会出现在这里。
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function sortArtifacts(releases: ReleaseSummary[]): ReleaseSummary[] {
  return [...releases].sort(
    (left, right) =>
      parseTimestamp(right.createdAt) - parseTimestamp(left.createdAt),
  );
}

function parseTimestamp(value: string | null): number {
  if (!value) return 0;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function formatDate(value: string | null): string {
  if (!value) return '时间未知';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function getDefaultAppId(apps: AppReleaseOverview[]): string {
  return (
    apps.find((app) => app.activeReleaseId)?.id ??
    apps.find((app) => app.releases.length > 0)?.id ??
    apps[0]?.id ??
    ''
  );
}
