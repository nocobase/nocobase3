import { useLink } from '@refinedev/core';
import {
  AlertCircle,
  ArrowRight,
  Boxes,
  CheckCircle2,
  Clock3,
  Database,
  History,
  PackageCheck,
  RefreshCw,
  ServerCog,
  ShieldCheck,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';

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
import { Skeleton } from '@/components/ui/skeleton';
import { formatDateTime } from '@/features/apps/presentation';
import {
  presentReleaseControlError,
  type ReleaseControlErrorPresentation,
} from '@/features/apps/release-control-error';
import {
  isReadinessBlocked,
  useReleaseManagement,
} from '@nocobase/hub-release-management/client';
import type {
  DeploymentRecord,
  ReleaseOverview,
} from '@nocobase/hub-release-management/types';
import { cn } from '@/lib/utils';

export default function SettingsHome() {
  const Link = useLink();
  const { overview, busy, error, errorCode, errorStatus, refresh } =
    useReleaseManagement();
  const stats = summarizePlatform(overview);
  const controlError = error
    ? presentReleaseControlError(error, errorCode, errorStatus)
    : null;
  const initialLoading =
    busy && overview.apps.length === 0 && overview.deployments.length === 0;
  const platformState = getPlatformState({
    busy: initialLoading,
    error: controlError,
    appCount: stats.apps,
    undeployedApps: stats.undeployedApps,
  });
  const recentDeployments = [...overview.deployments]
    .sort(
      (left, right) =>
        Date.parse(right.requestedAt) - Date.parse(left.requestedAt),
    )
    .slice(0, 4);

  return (
    <div className='space-y-6'>
      <section className='relative overflow-hidden rounded-2xl border bg-[radial-gradient(circle_at_top_right,color-mix(in_oklch,var(--primary)_13%,transparent),transparent_42%),linear-gradient(135deg,var(--card),color-mix(in_oklch,var(--muted)_55%,var(--card)))] p-6 shadow-sm md:p-8'>
        <div className='absolute -right-14 -top-20 size-64 rounded-full border border-primary/10' />
        <div className='absolute -right-2 -top-8 size-36 rounded-full border border-primary/10' />
        <div className='relative grid gap-6 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end'>
          <div className='max-w-3xl space-y-4'>
            <Badge
              variant='outline'
              className='h-7 gap-1.5 bg-background/70 px-3'
            >
              <ServerCog /> 平台状态
            </Badge>
            <div>
              <h1 className='font-heading text-3xl font-semibold tracking-tight md:text-4xl'>
                平台运行总览
              </h1>
              <p className='mt-3 max-w-2xl text-sm leading-6 text-muted-foreground md:text-base'>
                汇总 Hub 身份、控制面与 App Host 的实时状态，快速定位平台问题，
                再进入对应 App 处理版本、资源和业务配置。
              </p>
            </div>
          </div>
          <div className='flex flex-wrap items-center gap-2 xl:flex-nowrap'>
            <Button
              variant='outline'
              className='bg-background/75'
              nativeButton={false}
              render={<Link to='/apps' />}
            >
              <Boxes /> 查看所有 App
            </Button>
            <Button
              variant='outline'
              size='icon'
              className='bg-background/75'
              aria-label='刷新平台状态'
              disabled={busy}
              onClick={() => void refresh()}
            >
              <RefreshCw className={cn(busy && 'animate-spin')} />
            </Button>
          </div>
        </div>
      </section>

      <PlatformStateBanner
        title={platformState.title}
        description={platformState.description}
        tone={platformState.tone}
        busy={initialLoading}
        action={
          !initialLoading && !error && stats.undeployedApps > 0 ? (
            <Button
              variant='outline'
              size='sm'
              className='bg-background/75'
              nativeButton={false}
              render={<Link to='/apps' />}
            >
              查看未上线 App <ArrowRight />
            </Button>
          ) : null
        }
      />

      {controlError ? (
        <Alert variant='destructive'>
          <AlertCircle />
          <AlertTitle>{controlError.title}</AlertTitle>
          <AlertDescription>{controlError.description}</AlertDescription>
        </Alert>
      ) : null}

      <section
        className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'
        aria-label='平台关键指标'
      >
        <MetricCard
          label='受管 App'
          value={controlError ? null : stats.apps}
          detail={
            controlError
              ? '当前无法读取 App 清单'
              : stats.apps === 0
                ? '等待首个 App'
                : 'App Host 已发现'
          }
          icon={Boxes}
          loading={initialLoading}
        />
        <MetricCard
          label='已上线'
          value={controlError ? null : stats.deployed}
          detail={
            controlError
              ? '当前无法读取运行状态'
              : stats.undeployedApps > 0
                ? `${stats.undeployedApps} 个 App 尚未上线`
                : '当前版本可承载流量'
          }
          icon={CheckCircle2}
          tone={stats.undeployedApps > 0 ? 'warning' : 'success'}
          loading={initialLoading}
        />
        <MetricCard
          label='不可变 Release'
          value={controlError ? null : stats.releases}
          detail={
            controlError
              ? '当前无法读取 Release'
              : `${stats.candidateReleases} 个非当前版本`
          }
          icon={PackageCheck}
          loading={initialLoading}
        />
        <MetricCard
          label='历史失败记录'
          value={controlError ? null : stats.failedDeployments}
          detail={
            controlError
              ? '当前无法读取发布记录'
              : stats.readinessBlocks > 0
                ? `${stats.readinessBlocks} 次被健康门禁拦截`
                : '暂无门禁拦截'
          }
          icon={TriangleAlert}
          tone={stats.failedDeployments > 0 ? 'warning' : 'default'}
          loading={initialLoading}
        />
      </section>

      <div className='grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]'>
        <Card>
          <CardHeader className='border-b'>
            <CardTitle>服务与连接</CardTitle>
            <CardDescription>
              区分 Hub 自身能力与 App 运行面的连接状态
            </CardDescription>
            <CardAction>
              <Badge variant={controlError ? 'destructive' : 'secondary'}>
                {initialLoading
                  ? '检查中'
                  : controlError
                    ? controlError.kind === 'authorization'
                      ? '权限受限'
                      : '1 项异常'
                    : '全部可用'}
              </Badge>
            </CardAction>
          </CardHeader>
          <CardContent className='divide-y px-0'>
            <ServiceRow
              icon={ShieldCheck}
              title='Hub 原生认证'
              description='独立用户库、登录 Session、管理员鉴权与 CSRF 写保护'
              status='已启用'
              tone='healthy'
              detail='当前管理页已通过受保护路由访问'
            />
            <ServiceRow
              icon={Database}
              title='Hub 控制面数据'
              description='保存 V3 身份、平台设置与服务端审计状态'
              status='已就绪'
              tone='healthy'
              detail='Migration 幂等执行，配置由服务端持久化'
            />
            <ServiceRow
              icon={ServerCog}
              title='App Host'
              description='发现、运行并原子切换 Hub 管理的 App Release'
              status={
                initialLoading
                  ? '检查中'
                  : controlError?.kind === 'app-host'
                    ? '未连接'
                    : controlError
                      ? '状态受限'
                      : '已连接'
              }
              tone={
                initialLoading
                  ? 'muted'
                  : controlError?.kind === 'app-host'
                    ? 'danger'
                    : controlError
                      ? 'muted'
                      : 'healthy'
              }
              detail={
                controlError
                  ? controlError.kind === 'authorization'
                    ? '当前账号无权读取 App 清单和发布状态'
                    : 'App 清单与发布操作暂不可用'
                  : `${stats.apps} 个 App · ${stats.releases} 个 Release · 健康门禁已启用`
              }
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='border-b'>
            <CardTitle>最近发布活动</CardTitle>
            <CardDescription>最近 4 次 Agent 发布或回滚结果</CardDescription>
            <CardAction>
              <Button
                variant='ghost'
                size='sm'
                nativeButton={false}
                render={<Link to='/apps' />}
              >
                查看应用 <ArrowRight />
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            {initialLoading ? (
              <div className='space-y-4' aria-label='正在加载发布活动'>
                {[0, 1, 2].map((item) => (
                  <Skeleton key={item} className='h-14 w-full' />
                ))}
              </div>
            ) : recentDeployments.length === 0 ? (
              <div className='grid min-h-52 place-items-center text-center'>
                <div className='max-w-xs'>
                  <div className='mx-auto grid size-11 place-items-center rounded-xl bg-muted text-muted-foreground'>
                    <History />
                  </div>
                  <p className='mt-3 font-medium'>暂无发布记录</p>
                  <p className='mt-1 text-xs leading-5 text-muted-foreground'>
                    Agent 完成首次受控发布后，执行人、版本与结果会显示在这里。
                  </p>
                </div>
              </div>
            ) : (
              <div className='divide-y'>
                {recentDeployments.map((deployment) => (
                  <RecentDeployment
                    key={deployment.id}
                    deployment={deployment}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function PlatformStateBanner({
  title,
  description,
  tone,
  busy,
  action,
}: {
  title: string;
  description: string;
  tone: 'healthy' | 'warning' | 'danger' | 'muted';
  busy: boolean;
  action?: ReactNode;
}) {
  const Icon =
    tone === 'danger'
      ? AlertCircle
      : tone === 'warning'
        ? TriangleAlert
        : CheckCircle2;
  return (
    <div
      className={cn(
        'flex flex-col justify-between gap-4 rounded-xl border p-4 sm:flex-row sm:items-center',
        tone === 'healthy' && 'border-emerald-500/20 bg-emerald-500/[0.055]',
        tone === 'warning' && 'border-amber-500/20 bg-amber-500/[0.06]',
        tone === 'danger' && 'border-destructive/20 bg-destructive/[0.04]',
        tone === 'muted' && 'bg-muted/35',
      )}
      role='status'
    >
      <div className='flex items-start gap-3'>
        <div
          className={cn(
            'grid size-10 shrink-0 place-items-center rounded-xl bg-background text-muted-foreground shadow-sm ring-1 ring-foreground/10',
            tone === 'healthy' && 'text-emerald-600',
            tone === 'warning' && 'text-amber-600',
            tone === 'danger' && 'text-destructive',
          )}
        >
          <Icon className={cn('size-5', busy && 'animate-pulse')} />
        </div>
        <div>
          <p className='font-medium'>{title}</p>
          <p className='mt-1 text-sm text-muted-foreground'>{description}</p>
        </div>
      </div>
      {action ?? (
        <Badge variant={tone === 'danger' ? 'destructive' : 'outline'}>
          {busy ? '正在读取实时状态' : '来自 Hub 控制面'}
        </Badge>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  tone = 'default',
  loading,
}: {
  label: string;
  value: number | null;
  detail: string;
  icon: LucideIcon;
  tone?: 'default' | 'success' | 'warning' | 'danger';
  loading: boolean;
}) {
  return (
    <Card size='sm' aria-label={`${label}：${value ?? '暂不可用'}`}>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardAction>
          <div
            className={cn(
              'grid size-9 place-items-center rounded-xl bg-muted text-muted-foreground',
              tone === 'success' &&
                'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
              tone === 'warning' && 'bg-amber-500/10 text-amber-700',
              tone === 'danger' && 'bg-destructive/10 text-destructive',
            )}
          >
            <Icon className='size-4.5' />
          </div>
        </CardAction>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className='h-9 w-16' />
        ) : (
          <div className='text-3xl font-semibold tabular-nums'>
            {value ?? '—'}
          </div>
        )}
        <p className='mt-1 text-xs text-muted-foreground'>{detail}</p>
      </CardContent>
    </Card>
  );
}

function ServiceRow({
  icon: Icon,
  title,
  description,
  status,
  tone,
  detail,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  status: string;
  tone: 'healthy' | 'danger' | 'muted';
  detail: string;
}) {
  return (
    <div className='flex flex-col gap-3 px-4 py-5 sm:flex-row sm:items-start'>
      <div
        className={cn(
          'grid size-10 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground',
          tone === 'healthy' && 'bg-emerald-500/10 text-emerald-600',
          tone === 'danger' && 'bg-destructive/10 text-destructive',
        )}
      >
        <Icon className='size-5' />
      </div>
      <div className='min-w-0 flex-1'>
        <div className='flex flex-wrap items-center justify-between gap-2'>
          <p className='font-medium'>{title}</p>
          <Badge
            variant={
              tone === 'danger'
                ? 'destructive'
                : tone === 'healthy'
                  ? 'secondary'
                  : 'outline'
            }
          >
            {status}
          </Badge>
        </div>
        <p className='mt-1 text-sm text-muted-foreground'>{description}</p>
        <p className='mt-2 text-xs text-muted-foreground/80'>{detail}</p>
      </div>
    </div>
  );
}

function RecentDeployment({ deployment }: { deployment: DeploymentRecord }) {
  const failed = deployment.status === 'failed';
  const pending = deployment.status === 'pending';
  const blocked = isReadinessBlocked(deployment);
  const Icon = failed ? AlertCircle : pending ? Clock3 : CheckCircle2;
  return (
    <div className='flex items-start gap-3 py-4 first:pt-0 last:pb-0'>
      <div
        className={cn(
          'mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-emerald-500/10 text-emerald-600',
          failed && 'bg-destructive/10 text-destructive',
          pending && 'bg-amber-500/10 text-amber-600',
        )}
      >
        <Icon className='size-4' />
      </div>
      <div className='min-w-0 flex-1'>
        <div className='flex flex-wrap items-center justify-between gap-2'>
          <p className='truncate font-medium'>
            {deployment.appId} · {deployment.releaseId}
          </p>
          <DeploymentStatusBadge deployment={deployment} />
        </div>
        <p className='mt-1 text-xs text-muted-foreground'>
          {deployment.kind === 'rollback' ? '回滚' : '发布'} ·{' '}
          {deployment.actor.name} · {formatDateTime(deployment.requestedAt)}
        </p>
        {failed ? (
          <p className='mt-1.5 line-clamp-2 text-xs text-destructive'>
            {blocked ? '健康门禁拦截：' : ''}
            {deployment.error?.message ?? '执行失败'}
          </p>
        ) : null}
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
    return (
      <Badge variant='destructive'>
        {isReadinessBlocked(deployment) ? '门禁拦截' : '失败'}
      </Badge>
    );
  }
  if (deployment.status === 'pending') {
    return <Badge variant='secondary'>执行中</Badge>;
  }
  if (deployment.status === 'unchanged') {
    return <Badge variant='outline'>已收敛</Badge>;
  }
  return <Badge className='bg-emerald-600 text-white'>成功</Badge>;
}

function summarizePlatform(overview: ReleaseOverview) {
  const releases = overview.apps.reduce(
    (total, app) => total + app.releases.length,
    0,
  );
  const deployed = overview.apps.filter((app) => app.activeReleaseId).length;
  return {
    apps: overview.apps.length,
    deployed,
    undeployedApps: overview.apps.length - deployed,
    releases,
    candidateReleases: overview.apps.reduce(
      (total, app) =>
        total +
        app.releases.filter((release) => release.id !== app.activeReleaseId)
          .length,
      0,
    ),
    failedDeployments: overview.deployments.filter(
      (deployment) => deployment.status === 'failed',
    ).length,
    readinessBlocks: overview.deployments.filter(isReadinessBlocked).length,
  };
}

function getPlatformState({
  busy,
  error,
  appCount,
  undeployedApps,
}: {
  busy: boolean;
  error: ReleaseControlErrorPresentation | null;
  appCount: number;
  undeployedApps: number;
}) {
  if (busy) {
    return {
      title: '正在检查平台状态',
      description: '正在从 Hub 控制面读取 App Host、应用和发布信息。',
      tone: 'muted' as const,
    };
  }
  if (error) {
    return {
      title: error.title,
      description: error.description,
      tone:
        error.kind === 'authentication' || error.kind === 'authorization'
          ? ('warning' as const)
          : ('danger' as const),
    };
  }
  if (appCount === 0) {
    return {
      title: '平台已就绪，等待首个 App',
      description: 'Hub 与 App Host 已连接，发布首个 Release 后会自动纳管。',
      tone: 'healthy' as const,
    };
  }
  if (undeployedApps > 0) {
    return {
      title: `${undeployedApps} 个 App 尚未上线`,
      description: '基础设施已连接，可进入应用运行管理查看版本与健康门禁。',
      tone: 'warning' as const,
    };
  }
  return {
    title: '平台运行正常',
    description: `${appCount} 个受管 App 均有在线版本，发布保护链可用。`,
    tone: 'healthy' as const,
  };
}
