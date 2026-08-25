import { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Bell,
  Bot,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Clock3,
  GitBranch,
  History,
  PackageCheck,
  RefreshCw,
  Rocket,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  UserCheck,
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
  ReleaseApprovalRecord,
  ReleaseNotificationRecord,
  ReleaseOverview,
  ReleaseSummary,
} from '@nocobase/hub-release-management/types';
import {
  getReleaseAction,
  isReadinessBlocked,
  summarizeOverview,
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
  onDecide: (input: {
    approvalId: string;
    decision: 'approve' | 'reject';
  }) => void;
}

type PendingAction = {
  app: AppReleaseOverview;
  release: ReleaseSummary;
  kind: DeploymentKind;
};

const protectionGates = [
  {
    title: 'Release 清单校验',
    description: '身份、版本、运行策略与路径约束',
    icon: PackageCheck,
  },
  {
    title: '发布审批与通知',
    description: '审批通过后才允许进入执行面',
    icon: UserCheck,
  },
  {
    title: '隔离启动候选版本',
    description: '在线版本继续接收业务流量',
    icon: GitBranch,
  },
  {
    title: '健康门禁',
    description: '候选版本必须通过 readiness probe',
    icon: ShieldCheck,
  },
  {
    title: '原子切流与审计',
    description: '成功才切换，失败自动保留原版本',
    icon: History,
  },
];

export function ReleaseManagementDashboard({
  overview,
  scope = 'hub',
  busy = false,
  error,
  onRefresh,
  onExecute,
  onDecide,
}: ReleaseManagementDashboardProps) {
  const [selectedAppId, setSelectedAppId] = useState(() =>
    getDefaultAppId(overview.apps),
  );
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(
    null,
  );

  useEffect(() => {
    if (!overview.apps.some((app) => app.id === selectedAppId)) {
      setSelectedAppId(getDefaultAppId(overview.apps));
    }
  }, [overview.apps, selectedAppId]);

  const selectedApp =
    overview.apps.find((app) => app.id === selectedAppId) ?? overview.apps[0];
  const stats = summarizeOverview(overview);
  const deployments = selectedApp
    ? overview.deployments.filter(
        (deployment) => deployment.appId === selectedApp.id,
      )
    : overview.deployments;
  const approvals = selectedApp
    ? (overview.approvals ?? []).filter(
        (approval) => approval.appId === selectedApp.id,
      )
    : (overview.approvals ?? []);
  const notifications = selectedApp
    ? (overview.notifications ?? []).filter(
        (notification) => notification.appId === selectedApp.id,
      )
    : (overview.notifications ?? []);
  const appScoped = scope === 'app';

  return (
    <div className='space-y-6'>
      <section className='relative overflow-hidden rounded-2xl border bg-[radial-gradient(circle_at_top_right,color-mix(in_oklch,var(--primary)_10%,transparent),transparent_45%),linear-gradient(135deg,var(--card),color-mix(in_oklch,var(--muted)_55%,var(--card)))] p-6 shadow-sm md:p-8'>
        <div className='absolute -right-16 -top-20 size-64 rounded-full border border-primary/10' />
        <div className='absolute -right-5 -top-8 size-36 rounded-full border border-primary/10' />
        <div className='relative flex flex-col justify-between gap-6 lg:flex-row lg:items-end'>
          <div className='max-w-3xl space-y-4'>
            <Badge
              variant='outline'
              className='h-7 gap-1.5 bg-background/70 px-3'
            >
              <Sparkles /> {appScoped ? '版本与发布' : '发布中心'}
            </Badge>
            <div>
              <h1 className='font-heading text-3xl font-semibold tracking-tight md:text-4xl'>
                {appScoped
                  ? `${selectedApp?.name ?? '当前 App'} 的发布与回滚`
                  : '统一管理所有 App 的 Release'}
              </h1>
              <p className='mt-3 max-w-2xl text-sm leading-6 text-muted-foreground md:text-base'>
                不可变 Release 通过清单校验和 readiness
                后才会切换流量；失败保留原版本，并记录发布结果。
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
            刷新运行状态
          </Button>
        </div>
      </section>

      {error ? (
        <Alert variant='destructive'>
          <AlertCircle />
          <AlertTitle>无法读取发布控制面</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <section className='grid gap-4 sm:grid-cols-2 xl:grid-cols-5'>
        <MetricCard
          label='待发布审批'
          value={stats.awaitingApproval}
          detail='审批通过后才执行'
          icon={UserCheck}
        />
        <MetricCard
          label='受管应用'
          value={stats.apps}
          detail={`${stats.releases} 个不可变 Release`}
          icon={Bot}
        />
        <MetricCard
          label='在线健康'
          value={stats.online}
          detail='当前运行版本'
          icon={CheckCircle2}
          tone='success'
        />
        <MetricCard
          label='门禁拦截'
          value={stats.blocked}
          detail='坏版本未进入流量'
          icon={ShieldCheck}
          tone='danger'
        />
        <MetricCard
          label='可回滚点'
          value={stats.rollbackPoints}
          detail='历史 Release 随时恢复'
          icon={RotateCcw}
        />
      </section>

      {overview.apps.length === 0 ? (
        <EmptyReleases />
      ) : (
        <div className='grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]'>
          <div className='space-y-6'>
            <Card>
              <CardHeader className='border-b'>
                <CardTitle>
                  {appScoped ? '当前 App 的发布通道' : '应用发布通道'}
                </CardTitle>
                <CardDescription>
                  {appScoped
                    ? '查看当前在线版本与候选 Release'
                    : '选择应用后查看当前在线版本与候选 Release'}
                </CardDescription>
              </CardHeader>
              <CardContent className='space-y-5'>
                {!appScoped ? (
                  <div className='flex gap-2 overflow-x-auto pb-1'>
                    {overview.apps.map((app) => (
                      <Button
                        key={app.id}
                        variant={
                          app.id === selectedApp?.id ? 'default' : 'outline'
                        }
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
                    <ActiveRelease app={selectedApp} />
                    <div className='space-y-3'>
                      <div className='flex items-center justify-between'>
                        <div>
                          <h2 className='font-medium'>Release 仓库</h2>
                          <p className='text-xs text-muted-foreground'>
                            同一 Release 重复执行不会重启应用
                          </p>
                        </div>
                        <Badge variant='secondary'>
                          {selectedApp.releases.length} 个版本
                        </Badge>
                      </div>
                      <div className='divide-y overflow-hidden rounded-xl border bg-card'>
                        {selectedApp.releases.map((release) => {
                          const kind = getReleaseAction(selectedApp, release);
                          const isActive = kind === null;
                          const pendingApproval = approvals.find(
                            (approval) =>
                              approval.releaseId === release.id &&
                              approval.kind === kind &&
                              approval.status === 'pending',
                          );
                          return (
                            <div
                              key={release.id}
                              className={cn(
                                'flex flex-col gap-4 p-4 transition-colors md:flex-row md:items-center md:justify-between',
                                isActive && 'bg-emerald-500/[0.045]',
                              )}
                            >
                              <div className='flex min-w-0 items-start gap-3'>
                                <div
                                  className={cn(
                                    'mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg border bg-muted/50',
                                    isActive &&
                                      'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
                                  )}
                                >
                                  {isActive ? <Check /> : <Rocket />}
                                </div>
                                <div className='min-w-0'>
                                  <div className='flex flex-wrap items-center gap-2'>
                                    <span className='font-mono text-sm font-medium'>
                                      {release.version}
                                    </span>
                                    <span className='truncate text-xs text-muted-foreground'>
                                      {release.id}
                                    </span>
                                    {isActive ? (
                                      <Badge className='bg-emerald-600 text-white'>
                                        当前在线
                                      </Badge>
                                    ) : null}
                                  </div>
                                  <div className='mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground'>
                                    <span>{formatDate(release.createdAt)}</span>
                                    <span className='flex items-center gap-1'>
                                      <ShieldCheck className='size-3' />
                                      {formatHealthPath(
                                        release.runtime.healthPath,
                                      )}
                                    </span>
                                  </div>
                                </div>
                              </div>
                              <Button
                                variant={
                                  kind === 'rollback' ? 'outline' : 'default'
                                }
                                disabled={
                                  isActive || busy || Boolean(pendingApproval)
                                }
                                onClick={() =>
                                  kind &&
                                  setPendingAction({
                                    app: selectedApp,
                                    release,
                                    kind,
                                  })
                                }
                              >
                                {kind === 'rollback' ? (
                                  <RotateCcw />
                                ) : (
                                  <Rocket />
                                )}
                                {isActive
                                  ? '已上线'
                                  : pendingApproval
                                    ? '等待审批'
                                    : kind === 'rollback'
                                      ? '回滚到此版本'
                                      : '受控发布'}
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </>
                ) : null}
              </CardContent>
            </Card>

            <ApprovalQueue
              approvals={approvals}
              notifications={notifications}
              busy={busy}
              onDecide={onDecide}
            />
            <DeploymentTimeline deployments={deployments} />
          </div>

          <ProtectionPipeline />
        </div>
      )}

      <ReleaseConfirmation
        action={pendingAction}
        busy={busy}
        onCancel={() => setPendingAction(null)}
        onConfirm={() => {
          if (!pendingAction) return;
          onExecute({
            appId: pendingAction.app.id,
            releaseId: pendingAction.release.id,
            kind: pendingAction.kind,
          });
          setPendingAction(null);
        }}
      />
    </div>
  );
}

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  tone = 'default',
}: {
  label: string;
  value: number;
  detail: string;
  icon: typeof Bot;
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
        <p className='mt-1 text-xs text-muted-foreground'>{detail}</p>
      </CardContent>
    </Card>
  );
}

function ActiveRelease({ app }: { app: AppReleaseOverview }) {
  const deployed = Boolean(app.activeReleaseId);
  const sleeping = app.state === 'idle';
  return (
    <div
      className={cn(
        'grid gap-4 rounded-xl border p-4 sm:grid-cols-[1fr_auto] sm:items-center',
        deployed
          ? 'border-emerald-500/20 bg-emerald-500/[0.055]'
          : 'bg-muted/25',
      )}
    >
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
            <span className='font-medium'>生产流量</span>
            <Badge className={deployed ? 'bg-emerald-600 text-white' : ''}>
              {sleeping ? '已部署 · 休眠' : app.state}
            </Badge>
          </div>
          <p className='mt-1 text-xs text-muted-foreground'>
            {app.activeReleaseId
              ? `${app.activeReleaseId} · v${app.activeVersion}`
              : '尚未部署，业务流量未启用'}
          </p>
        </div>
      </div>
      <div className='flex flex-wrap items-center gap-3'>
        <div className='flex items-center gap-2 text-xs font-medium text-emerald-700 dark:text-emerald-400'>
          <ShieldCheck className='size-4' />
          {deployed ? '健康门禁已生效' : '等待首次受控发布'}
        </div>
        <AppAccessActions
          accessUrl={app.accessUrl}
          size='sm'
          variant='outline'
        />
      </div>
    </div>
  );
}

function ProtectionPipeline() {
  return (
    <Card className='h-fit xl:sticky xl:top-24'>
      <CardHeader className='border-b'>
        <CardTitle className='flex items-center gap-2'>
          <ShieldCheck className='text-emerald-600' />
          自动保护链
        </CardTitle>
        <CardDescription>
          Agent 只表达目标版本，平台负责上线过程
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className='space-y-0'>
          {protectionGates.map((gate, index) => {
            const Icon = gate.icon;
            return (
              <div
                key={gate.title}
                className='relative flex gap-3 pb-6 last:pb-0'
              >
                {index < protectionGates.length - 1 ? (
                  <div className='absolute left-[17px] top-9 h-[calc(100%-28px)] w-px bg-border' />
                ) : null}
                <div className='relative z-10 grid size-9 shrink-0 place-items-center rounded-full border bg-background text-emerald-600 shadow-sm'>
                  <Icon className='size-4' />
                </div>
                <div className='pt-0.5'>
                  <p className='text-sm font-medium'>{gate.title}</p>
                  <p className='mt-1 text-xs leading-5 text-muted-foreground'>
                    {gate.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
        <div className='mt-5 rounded-xl border bg-muted/40 p-4'>
          <div className='flex items-center gap-2 text-sm font-medium'>
            <Bot className='size-4' /> Agent API contract
          </div>
          <code className='mt-3 block overflow-x-auto rounded-lg bg-background p-3 text-[11px] text-muted-foreground ring-1 ring-foreground/10'>
            POST /deployments
            <br />
            Idempotency-Key: agent-run-id
            <br />
            {`{ "releaseId": "release-v3" }`}
          </code>
        </div>
      </CardContent>
    </Card>
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
        <CardTitle>发布审计时间线</CardTitle>
        <CardDescription>
          每次 Agent 操作都记录执行人、目标、结果和在线版本
        </CardDescription>
      </CardHeader>
      <CardContent>
        {deployments.length === 0 ? (
          <div className='grid min-h-32 place-items-center text-center text-sm text-muted-foreground'>
            首次受控发布后，完整审计记录会出现在这里
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

function ApprovalQueue({
  approvals,
  notifications,
  busy,
  onDecide,
}: {
  approvals: ReleaseApprovalRecord[];
  notifications: ReleaseNotificationRecord[];
  busy: boolean;
  onDecide: ReleaseManagementDashboardProps['onDecide'];
}) {
  if (approvals.length === 0) return null;
  return (
    <Card>
      <CardHeader className='border-b'>
        <CardTitle className='flex items-center gap-2'>
          <UserCheck /> 发布审批
        </CardTitle>
        <CardDescription>
          Agent 提交发布意图，审批通过后由平台执行校验与切流
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-3'>
        {approvals.map((approval) => {
          const latestNotification = notifications.find(
            (notification) => notification.approvalId === approval.id,
          );
          return (
            <div key={approval.id} className='rounded-xl border p-4'>
              <div className='flex flex-col justify-between gap-4 md:flex-row md:items-start'>
                <div className='min-w-0'>
                  <div className='flex flex-wrap items-center gap-2'>
                    <span className='font-medium'>
                      {approval.kind === 'rollback' ? '回滚' : '发布'}{' '}
                      {approval.releaseId}
                    </span>
                    <ApprovalStatusBadge approval={approval} />
                  </div>
                  <div className='mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground'>
                    <span>{formatDate(approval.requestedAt)}</span>
                    <span>申请人：{approval.requestedBy.name}</span>
                    <span className='font-mono'>{approval.idempotencyKey}</span>
                  </div>
                  {latestNotification ? (
                    <div className='mt-3 flex items-start gap-2 rounded-lg bg-muted/45 p-3 text-xs'>
                      <Bell className='mt-0.5 size-3.5 shrink-0 text-primary' />
                      <div>
                        <p className='font-medium'>
                          {latestNotification.title}
                        </p>
                        <p className='mt-1 text-muted-foreground'>
                          {latestNotification.body}
                        </p>
                      </div>
                    </div>
                  ) : null}
                </div>
                {approval.status === 'pending' ? (
                  <div className='flex shrink-0 gap-2'>
                    <Button
                      variant='outline'
                      disabled={busy}
                      onClick={() =>
                        onDecide({
                          approvalId: approval.id,
                          decision: 'reject',
                        })
                      }
                    >
                      <XCircle /> 拒绝
                    </Button>
                    <Button
                      disabled={busy}
                      onClick={() =>
                        onDecide({
                          approvalId: approval.id,
                          decision: 'approve',
                        })
                      }
                    >
                      <UserCheck /> 批准并发布
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function ApprovalStatusBadge({
  approval,
}: {
  approval: ReleaseApprovalRecord;
}) {
  if (approval.status === 'pending') {
    return <Badge variant='secondary'>待审批</Badge>;
  }
  if (approval.status === 'rejected') {
    return <Badge variant='destructive'>已拒绝</Badge>;
  }
  if (approval.status === 'failed') {
    return <Badge variant='destructive'>发布失败</Badge>;
  }
  if (approval.status === 'executing') {
    return <Badge variant='secondary'>执行中</Badge>;
  }
  return <Badge className='bg-emerald-600 text-white'>已完成</Badge>;
}

function DeploymentItem({ deployment }: { deployment: DeploymentRecord }) {
  const failed = deployment.status === 'failed';
  const blocked = isReadinessBlocked(deployment);
  const unchanged = deployment.status === 'unchanged';
  const pending = deployment.status === 'pending';
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
              {deployment.kind === 'rollback' ? '回滚' : '发布'}{' '}
              {deployment.releaseId}
            </span>
            <StatusBadge deployment={deployment} />
          </div>
          <div className='mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground'>
            <span>{formatDate(deployment.requestedAt)}</span>
            <span>{deployment.actor.name}</span>
            <span className='font-mono'>{deployment.idempotencyKey}</span>
          </div>
          {failed ? (
            <div className='mt-3 rounded-lg border border-destructive/15 bg-background/70 p-3 text-xs'>
              <p className='font-medium text-destructive'>
                {deployment.error?.code}: {deployment.error?.message}
              </p>
              <p className='mt-1.5 flex items-center gap-1.5 text-muted-foreground'>
                <ShieldCheck className='size-3.5 text-emerald-600' />
                {blocked ? '候选版本已隔离销毁，' : '本次操作未完成，'}
                在线流量仍由 {deployment.activeReleaseId ?? '原版本'} 承载
              </p>
            </div>
          ) : (
            <div className='mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground'>
              <span>{deployment.previousReleaseId ?? '未部署'}</span>
              <ArrowRight className='size-3.5' />
              <span className='font-medium text-foreground'>
                {deployment.activeReleaseId ?? '—'}
              </span>
              {unchanged ? <span>（重复执行，零变化）</span> : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ deployment }: { deployment: DeploymentRecord }) {
  if (deployment.status === 'failed') {
    return (
      <Badge variant='destructive'>
        {isReadinessBlocked(deployment) ? '门禁拦截' : '执行失败'}
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

function ReleaseConfirmation({
  action,
  busy,
  onCancel,
  onConfirm,
}: {
  action: PendingAction | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const rollback = action?.kind === 'rollback';
  return (
    <AlertDialog
      open={Boolean(action)}
      onOpenChange={(open) => !open && onCancel()}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia>
            {rollback ? <RotateCcw /> : <Rocket />}
          </AlertDialogMedia>
          <AlertDialogTitle>
            {rollback ? '确认受控回滚' : '提交发布审批'}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {action
              ? rollback
                ? `${action.app.name} 将回滚到 ${action.release.id}。候选版本只有通过健康门禁后才会接管流量。`
                : `${action.app.name} 的 ${action.release.id} 将进入发布审批；批准后才会执行健康校验和切流。`
              : ''}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className='rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground'>
          <div className='flex items-center gap-2'>
            <ShieldCheck className='size-4 text-emerald-600' />
            当前在线版本会保留到新版本验证成功
          </div>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>取消</AlertDialogCancel>
          <AlertDialogAction disabled={busy} onClick={onConfirm}>
            {rollback ? <RotateCcw /> : <ChevronRight />}
            {rollback ? '开始回滚' : '提交审批'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function formatHealthPath(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value : '/healthz';
}

function EmptyReleases() {
  return (
    <Card>
      <CardContent className='grid min-h-72 place-items-center py-12 text-center'>
        <div className='max-w-lg'>
          <div className='mx-auto grid size-14 place-items-center rounded-2xl bg-muted'>
            <PackageCheck className='size-7 text-muted-foreground' />
          </div>
          <h2 className='mt-4 text-lg font-medium'>等待生成首个 Release</h2>
          <p className='mt-2 text-sm leading-6 text-muted-foreground'>
            将构建产物写入 app-dist/&lt;app&gt;/releases/&lt;release&gt;，并提供
            app-release.json。 Hub 会自动发现，无需人工搭建发布页面或配置流程。
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function formatDate(value: string | null): string {
  if (!value) return '时间未知';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
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
