import { useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Check,
  CheckCircle2,
  CircleDashed,
  Clock3,
  FileCheck2,
  History,
  RefreshCw,
  Rocket,
  ShieldCheck,
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
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { AppAccessActions } from '@/features/apps/app-access-actions';
import { formatDateTime } from '@/features/apps/presentation';
import { useReleaseManagement } from '@nocobase/hub-release-management/client';
import type { DeploymentKind } from '@nocobase/hub-release-management/types';

import {
  buildAgentDeliveries,
  deliveryStageLabel,
  filterAgentDeliveries,
  readinessCheckLabel,
  summarizeAgentDeliveries,
  type AgentDelivery,
  type AgentDeliveryStage,
  type AgentDeliveryView,
  type DeliveryCheckStatus,
} from './logic';

type ConfirmationAction = 'submit' | 'approve' | 'reject' | 'rollback';

const releaseSteps = ['生成版本', '提交审批', '上线前检查', '切换在线版本'];

export default function AgentDeliveries() {
  const { overview, busy, error, errorStatus, refresh, run, decide } =
    useReleaseManagement();
  const deliveries = useMemo(() => buildAgentDeliveries(overview), [overview]);
  const summary = useMemo(
    () => summarizeAgentDeliveries(deliveries),
    [deliveries],
  );
  const defaultView: AgentDeliveryView = summary.needsAttention
    ? 'attention'
    : summary.executing
      ? 'in-progress'
      : 'online';
  const [selectedView, setSelectedView] = useState<AgentDeliveryView | null>(
    null,
  );
  const activeView = selectedView ?? defaultView;
  const visibleDeliveries = useMemo(
    () => filterAgentDeliveries(deliveries, activeView),
    [activeView, deliveries],
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected =
    visibleDeliveries.find((delivery) => delivery.id === selectedId) ??
    visibleDeliveries[0] ??
    null;

  return (
    <div className='space-y-6'>
      <section className='relative overflow-hidden rounded-2xl border bg-[radial-gradient(circle_at_top_right,color-mix(in_oklch,var(--primary)_12%,transparent),transparent_43%),linear-gradient(135deg,var(--card),color-mix(in_oklch,var(--muted)_55%,var(--card)))] p-6 shadow-sm md:p-8'>
        <div className='absolute -right-16 -top-20 size-64 rounded-full border border-primary/10' />
        <div className='relative flex flex-col justify-between gap-6 lg:flex-row lg:items-end'>
          <div className='max-w-3xl'>
            <Badge
              variant='outline'
              className='h-7 gap-1.5 bg-background/70 px-3'
            >
              <Rocket /> 版本与发布
            </Badge>
            <h1 className='mt-4 font-heading text-3xl font-semibold tracking-tight md:text-4xl'>
              安全地把 App 新版本上线
            </h1>
            <p className='mt-3 max-w-2xl text-sm leading-6 text-muted-foreground md:text-base'>
              在这里处理版本审批、上线检查和回滚。新版本只有通过审批与健康检查后，
              才会替换当前在线版本。
            </p>
            <ol className='mt-5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground'>
              {releaseSteps.map((step, index) => (
                <li key={step} className='flex items-center gap-2'>
                  <span className='rounded-full border bg-background/70 px-3 py-1.5'>
                    {index + 1}. {step}
                  </span>
                  {index < releaseSteps.length - 1 ? (
                    <ArrowRight className='size-3.5' />
                  ) : null}
                </li>
              ))}
            </ol>
          </div>
          <Button
            variant='outline'
            size='lg'
            className='w-fit bg-background/75'
            disabled={busy}
            onClick={() => void refresh()}
          >
            <RefreshCw className={cn(busy && 'animate-spin')} />
            刷新状态
          </Button>
        </div>
      </section>

      {error ? (
        <Alert variant='destructive'>
          <AlertCircle />
          <AlertTitle>无法加载版本与发布数据</AlertTitle>
          <AlertDescription>
            {errorStatus === 401 || errorStatus === 403
              ? '当前账号没有发布管理权限，请使用 Hub 管理员账号登录。'
              : error}
          </AlertDescription>
        </Alert>
      ) : null}

      <section className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
        <MetricCard
          label='待我处理'
          value={summary.needsAttention}
          detail='待提交或待审批'
          icon={Clock3}
          tone={summary.needsAttention ? 'warning' : 'default'}
        />
        <MetricCard
          label='发布中'
          value={summary.executing}
          detail='正在检查或切换版本'
          icon={RefreshCw}
          tone={summary.executing ? 'warning' : 'default'}
        />
        <MetricCard
          label='当前在线'
          value={summary.online}
          detail='正在对外提供服务的 App'
          icon={CheckCircle2}
          tone='success'
        />
        <MetricCard
          label='失败记录'
          value={summary.failed}
          detail='发布失败或审批驳回'
          icon={AlertCircle}
          tone={summary.failed ? 'danger' : 'default'}
        />
      </section>

      {busy && deliveries.length === 0 ? (
        <div className='grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]'>
          <Skeleton className='h-[520px] rounded-xl' />
          <Skeleton className='h-[520px] rounded-xl' />
        </div>
      ) : deliveries.length === 0 ? (
        <Card className='border-dashed py-16'>
          <CardContent className='text-center'>
            <Rocket className='mx-auto size-10 text-muted-foreground' />
            <h2 className='mt-4 font-heading text-lg font-semibold'>
              暂无可发布版本
            </h2>
            <p className='mt-2 text-sm text-muted-foreground'>
              App 完成构建后，新版本会自动出现在这里。
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <ReleaseFilters
            activeView={activeView}
            summary={summary}
            total={deliveries.length}
            history={filterAgentDeliveries(deliveries, 'history').length}
            onChange={(view) => {
              setSelectedView(view);
              setSelectedId(null);
            }}
          />
          <div className='grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_420px]'>
            <DeliveryList
              deliveries={visibleDeliveries}
              selectedId={selected?.id ?? null}
              view={activeView}
              onSelect={setSelectedId}
            />
            {selected ? (
              <DeliveryDetail
                delivery={selected}
                busy={busy}
                onSubmit={(kind) =>
                  void run({
                    appId: selected.app.id,
                    releaseId: selected.release.id,
                    kind,
                  })
                }
                onApprove={() =>
                  selected.approval &&
                  void decide({
                    approvalId: selected.approval.id,
                    decision: 'approve',
                  })
                }
                onReject={() =>
                  selected.approval &&
                  void decide({
                    approvalId: selected.approval.id,
                    decision: 'reject',
                  })
                }
              />
            ) : (
              <Card className='border-dashed py-14 xl:sticky xl:top-24'>
                <CardContent className='text-center'>
                  <CheckCircle2 className='mx-auto size-8 text-emerald-600' />
                  <h2 className='mt-3 font-medium'>当前分类没有版本</h2>
                  <p className='mt-1 text-xs text-muted-foreground'>
                    可切换上方分类查看其他版本记录。
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function ReleaseFilters({
  activeView,
  summary,
  total,
  history,
  onChange,
}: {
  activeView: AgentDeliveryView;
  summary: ReturnType<typeof summarizeAgentDeliveries>;
  total: number;
  history: number;
  onChange: (view: AgentDeliveryView) => void;
}) {
  const options: Array<{
    view: AgentDeliveryView;
    label: string;
    count: number;
  }> = [
    { view: 'attention', label: '待处理', count: summary.needsAttention },
    { view: 'in-progress', label: '发布中', count: summary.executing },
    { view: 'online', label: '当前在线', count: summary.online },
    { view: 'exceptions', label: '失败记录', count: summary.failed },
    { view: 'history', label: '历史版本', count: history },
    { view: 'all', label: '全部', count: total },
  ];

  return (
    <div className='flex flex-wrap gap-2' aria-label='版本分类'>
      {options.map((option) => (
        <Button
          key={option.view}
          size='sm'
          variant={activeView === option.view ? 'default' : 'outline'}
          onClick={() => onChange(option.view)}
        >
          {option.label}
          <span
            className={cn(
              'ml-1 rounded-full px-1.5 text-[11px] tabular-nums',
              activeView === option.view
                ? 'bg-primary-foreground/15'
                : 'bg-muted',
            )}
          >
            {option.count}
          </span>
        </Button>
      ))}
    </div>
  );
}

function DeliveryList({
  deliveries,
  selectedId,
  view,
  onSelect,
}: {
  deliveries: AgentDelivery[];
  selectedId: string | null;
  view: AgentDeliveryView;
  onSelect: (id: string) => void;
}) {
  return (
    <Card className='gap-0'>
      <CardHeader className='border-b'>
        <CardTitle>{deliveryViewTitle(view)}</CardTitle>
        <CardDescription>{deliveryViewDescription(view)}</CardDescription>
      </CardHeader>
      <CardContent className='divide-y p-0'>
        {deliveries.length === 0 ? (
          <div className='px-5 py-12 text-center text-sm text-muted-foreground'>
            当前没有{deliveryViewTitle(view)}
          </div>
        ) : null}
        {deliveries.map((delivery) => (
          <button
            key={delivery.id}
            type='button'
            className={cn(
              'flex w-full items-start gap-3 px-5 py-4 text-left transition-colors hover:bg-muted/45',
              selectedId === delivery.id && 'bg-primary/[0.055]',
            )}
            onClick={() => onSelect(delivery.id)}
          >
            <DeliveryIcon stage={delivery.stage} />
            <span className='min-w-0 flex-1'>
              <span className='flex flex-wrap items-center gap-2'>
                <span className='font-medium'>{delivery.app.name}</span>
                <span className='text-sm font-medium text-muted-foreground'>
                  v{delivery.release.version}
                </span>
                <DeliveryStageBadge stage={delivery.stage} />
              </span>
              <span className='mt-1 block text-xs text-muted-foreground'>
                {deliveryStageDescription(delivery)}
              </span>
              <span className='mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground'>
                <span>{formatDateTime(delivery.release.createdAt)}</span>
                <span>
                  {delivery.approval
                    ? `提交人：${delivery.approval.requestedBy.name}`
                    : '来源：App 构建产物'}
                </span>
              </span>
              <span className='mt-1 block truncate font-mono text-[10px] text-muted-foreground/70'>
                {delivery.release.id}
              </span>
            </span>
            <ArrowRight className='mt-2 size-4 shrink-0 text-muted-foreground' />
          </button>
        ))}
      </CardContent>
    </Card>
  );
}

function DeliveryDetail({
  delivery,
  busy,
  onSubmit,
  onApprove,
  onReject,
}: {
  delivery: AgentDelivery;
  busy: boolean;
  onSubmit: (kind: DeploymentKind) => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  const [confirmation, setConfirmation] = useState<ConfirmationAction | null>(
    null,
  );
  const pendingApproval = delivery.stage === 'pending-approval';
  const confirmationCopy = getConfirmationCopy(confirmation, delivery);

  const confirm = () => {
    if (confirmation === 'submit') onSubmit('deploy');
    if (confirmation === 'approve') onApprove();
    if (confirmation === 'reject') onReject();
    if (confirmation === 'rollback') onSubmit('rollback');
    setConfirmation(null);
  };

  return (
    <>
      <Card className='gap-0 xl:sticky xl:top-24'>
        <CardHeader className='border-b'>
          <div className='flex items-start justify-between gap-3'>
            <div>
              <CardTitle>{delivery.app.name}</CardTitle>
              <CardDescription className='mt-1'>
                版本 v{delivery.release.version}
              </CardDescription>
            </div>
            <DeliveryStageBadge stage={delivery.stage} />
          </div>
        </CardHeader>
        <CardContent className='space-y-5 pt-4'>
          <NextStep delivery={delivery} />

          <section>
            <h2 className='text-sm font-medium'>版本信息</h2>
            <dl className='mt-3 grid grid-cols-[84px_minmax(0,1fr)] gap-x-3 gap-y-2 text-xs'>
              <dt className='text-muted-foreground'>生成时间</dt>
              <dd>{formatDateTime(delivery.release.createdAt)}</dd>
              <dt className='text-muted-foreground'>生成来源</dt>
              <dd>
                {delivery.approval
                  ? `${delivery.approval.requestedBy.name} · ${delivery.approval.requestedBy.role}`
                  : 'App 构建产物'}
              </dd>
              <dt className='text-muted-foreground'>当前在线</dt>
              <dd>
                {delivery.app.activeVersion
                  ? `v${delivery.app.activeVersion}`
                  : '尚未上线'}
              </dd>
              <dt className='text-muted-foreground'>版本标识</dt>
              <dd className='break-all font-mono text-[11px]'>
                {delivery.release.id}
              </dd>
            </dl>
          </section>

          <section>
            <h2 className='text-sm font-medium'>上线流程</h2>
            <div className='mt-3 space-y-2'>
              <CheckRow
                status={delivery.manifestCheck}
                title='版本信息完整'
                detail='已识别 App、版本和启动策略；执行时再次核对文件完整性'
              />
              <CheckRow
                status={delivery.approvalCheck}
                title='发布审批'
                detail={
                  delivery.approval
                    ? `当前状态：${deliveryStageLabel(delivery.stage)}`
                    : delivery.stage === 'online'
                      ? '当前在线版本没有可用的历史审批记录'
                      : '提交后由发布管理员审批'
                }
              />
              <CheckRow
                status={delivery.readinessCheck}
                title='上线前健康检查'
                detail={readinessCheckLabel(delivery)}
              />
              <CheckRow
                status={delivery.trafficCheck}
                title='切换在线版本'
                detail={
                  delivery.stage === 'online'
                    ? '当前版本正在对外提供服务'
                    : '前置步骤全部通过后才会替换在线版本'
                }
              />
            </div>
          </section>

          {delivery.deployment?.error ? (
            <Alert variant='destructive'>
              <AlertCircle />
              <AlertTitle>上线失败，在线版本未切换</AlertTitle>
              <AlertDescription>
                {delivery.deployment.error.message}
                <span className='mt-1 block font-mono text-[11px]'>
                  {delivery.deployment.error.code}
                </span>
              </AlertDescription>
            </Alert>
          ) : null}

          <Alert>
            <ShieldCheck />
            <AlertTitle>当前发布策略</AlertTitle>
            <AlertDescription>
              采用单环境受控发布：检查失败时保留原在线版本；暂不包含测试环境与多环境晋级。
            </AlertDescription>
          </Alert>

          <div className='flex flex-wrap gap-2 border-t pt-4'>
            <AppAccessActions
              accessUrl={delivery.app.accessUrl}
              size='sm'
              showCopy={false}
            />
            {delivery.stage === 'ready' && delivery.action ? (
              <Button disabled={busy} onClick={() => setConfirmation('submit')}>
                <Rocket /> 提交审批
              </Button>
            ) : null}
            {pendingApproval ? (
              <>
                <Button
                  variant='outline'
                  disabled={busy}
                  onClick={() => setConfirmation('reject')}
                >
                  <XCircle /> 拒绝发布
                </Button>
                <Button
                  disabled={busy}
                  onClick={() => setConfirmation('approve')}
                >
                  <UserCheck /> 批准并上线
                </Button>
              </>
            ) : null}
            {delivery.stage === 'historical' && delivery.action ? (
              <Button
                variant='outline'
                disabled={busy}
                onClick={() => setConfirmation('rollback')}
              >
                <History /> 回滚到此版本
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <AlertDialog
        open={confirmation !== null}
        onOpenChange={(open) => !open && setConfirmation(null)}
      >
        <AlertDialogContent size='sm'>
          <AlertDialogHeader>
            <AlertDialogMedia>
              {confirmation === 'approve' ? <Rocket /> : <ShieldCheck />}
            </AlertDialogMedia>
            <AlertDialogTitle>{confirmationCopy.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmationCopy.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              variant={confirmation === 'reject' ? 'destructive' : 'default'}
              onClick={confirm}
            >
              {confirmationCopy.confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function NextStep({ delivery }: { delivery: AgentDelivery }) {
  const content: Record<AgentDeliveryStage, { title: string; detail: string }> =
    {
      ready: {
        title: '下一步：提交发布审批',
        detail: '提交后不会立即上线，发布管理员审批通过后才会执行上线检查。',
      },
      'pending-approval': {
        title: '需要发布管理员审批',
        detail: '批准后将立即执行健康检查；检查通过才会切换在线版本。',
      },
      executing: {
        title: '正在执行上线检查',
        detail: '当前在线版本仍在提供服务，请等待检查与切换结果。',
      },
      online: {
        title: '当前版本已在线',
        detail: '用户访问此 App 时使用的就是这个版本。',
      },
      rejected: {
        title: '此次发布已被拒绝',
        detail: '版本没有上线，可修正后生成新版本并重新提交。',
      },
      failed: {
        title: '上线未完成',
        detail: '系统已保留原在线版本，请查看失败原因后重新构建或发布。',
      },
      historical: {
        title: '这是一个历史版本',
        detail: '仅在需要恢复线上服务时发起回滚，回滚同样需要审批和健康检查。',
      },
    };
  const current = content[delivery.stage];

  return (
    <div
      className={cn(
        'rounded-xl border bg-muted/35 p-3.5',
        delivery.stage === 'pending-approval' &&
          'border-amber-500/30 bg-amber-500/[0.06]',
        delivery.stage === 'failed' &&
          'border-destructive/30 bg-destructive/[0.04]',
      )}
    >
      <p className='text-sm font-medium'>{current.title}</p>
      <p className='mt-1 text-xs leading-5 text-muted-foreground'>
        {current.detail}
      </p>
    </div>
  );
}

function CheckRow({
  status,
  title,
  detail,
}: {
  status: DeliveryCheckStatus;
  title: string;
  detail: string;
}) {
  const Icon =
    status === 'passed'
      ? CheckCircle2
      : status === 'failed'
        ? XCircle
        : CircleDashed;
  return (
    <div className='flex items-start gap-3 rounded-lg border p-3'>
      <Icon
        className={cn(
          'mt-0.5 size-4 shrink-0 text-muted-foreground',
          status === 'passed' && 'text-emerald-600',
          status === 'failed' && 'text-destructive',
        )}
      />
      <div>
        <p className='text-xs font-medium'>{title}</p>
        <p className='mt-1 text-xs leading-5 text-muted-foreground'>{detail}</p>
      </div>
    </div>
  );
}

function DeliveryIcon({ stage }: { stage: AgentDeliveryStage }) {
  const Icon =
    stage === 'online'
      ? Check
      : ['failed', 'rejected'].includes(stage)
        ? AlertCircle
        : stage === 'historical'
          ? History
          : FileCheck2;
  return (
    <span
      className={cn(
        'grid size-10 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground',
        stage === 'online' && 'bg-emerald-500/10 text-emerald-700',
        ['failed', 'rejected'].includes(stage) &&
          'bg-destructive/10 text-destructive',
        stage === 'pending-approval' && 'bg-amber-500/10 text-amber-700',
      )}
    >
      <Icon className='size-4' />
    </span>
  );
}

function DeliveryStageBadge({ stage }: { stage: AgentDeliveryStage }) {
  if (stage === 'online') {
    return <Badge className='bg-emerald-600 text-white'>当前在线</Badge>;
  }
  if (['failed', 'rejected'].includes(stage)) {
    return <Badge variant='destructive'>{deliveryStageLabel(stage)}</Badge>;
  }
  if (stage === 'pending-approval') {
    return <Badge variant='secondary'>待审批</Badge>;
  }
  return <Badge variant='outline'>{deliveryStageLabel(stage)}</Badge>;
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
  icon: typeof ShieldCheck;
  tone?: 'default' | 'success' | 'warning' | 'danger';
}) {
  return (
    <Card size='sm'>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardAction>
          <span
            className={cn(
              'grid size-8 place-items-center rounded-lg bg-muted text-muted-foreground',
              tone === 'success' && 'bg-emerald-500/10 text-emerald-700',
              tone === 'warning' && 'bg-amber-500/10 text-amber-700',
              tone === 'danger' && 'bg-destructive/10 text-destructive',
            )}
          >
            <Icon className='size-4' />
          </span>
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className='text-3xl font-semibold tabular-nums'>{value}</div>
        <p className='mt-1 text-xs text-muted-foreground'>{detail}</p>
      </CardContent>
    </Card>
  );
}

function deliveryViewTitle(view: AgentDeliveryView): string {
  const labels: Record<AgentDeliveryView, string> = {
    attention: '待处理版本',
    'in-progress': '正在发布',
    online: '当前在线版本',
    exceptions: '失败与驳回记录',
    history: '历史版本',
    all: '全部版本',
  };
  return labels[view];
}

function deliveryViewDescription(view: AgentDeliveryView): string {
  const descriptions: Record<AgentDeliveryView, string> = {
    attention: '需要提交审批或由发布管理员作出决定',
    'in-progress': '正在执行健康检查或切换在线版本',
    online: '各 App 当前正在对外提供服务的版本',
    exceptions: '没有切换上线的失败发布和驳回记录',
    history: '曾经生成或上线过、可用于回滚的版本',
    all: '所有 App 的版本与发布记录',
  };
  return descriptions[view];
}

function deliveryStageDescription(delivery: AgentDelivery): string {
  const descriptions: Record<AgentDeliveryStage, string> = {
    ready: '版本已生成，尚未提交审批',
    'pending-approval': '等待发布管理员决定是否上线',
    executing: '正在执行上线检查与版本切换',
    online: '当前正在对外提供服务',
    rejected: '审批未通过，版本未上线',
    failed: '上线检查或执行失败，原版本继续运行',
    historical: '历史版本，可按需发起回滚',
  };
  return descriptions[delivery.stage];
}

function getConfirmationCopy(
  action: ConfirmationAction | null,
  delivery: AgentDelivery,
): { title: string; description: string; confirmLabel: string } {
  if (action === 'approve') {
    return {
      title: `批准 ${delivery.app.name} v${delivery.release.version} 上线？`,
      description:
        '确认后会立即启动候选版本并执行健康检查。只有检查通过才会替换当前在线版本。',
      confirmLabel: '批准并上线',
    };
  }
  if (action === 'reject') {
    return {
      title: `拒绝 ${delivery.app.name} v${delivery.release.version}？`,
      description: '此次发布申请会被关闭，当前在线版本不受影响。',
      confirmLabel: '确认拒绝',
    };
  }
  if (action === 'rollback') {
    return {
      title: `回滚到 v${delivery.release.version}？`,
      description:
        '系统会提交回滚审批。审批通过后仍会执行健康检查，成功后才切换在线版本。',
      confirmLabel: '提交回滚审批',
    };
  }
  return {
    title: `提交 ${delivery.app.name} v${delivery.release.version} 的发布审批？`,
    description: '提交后等待发布管理员审批，不会立即影响当前在线版本。',
    confirmLabel: '确认提交',
  };
}
