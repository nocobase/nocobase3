import { useList } from '@refinedev/core';
import { useCanAccess } from '@nocobase/portal-sdk/acl';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  CalendarClock,
  CircleDollarSign,
  Sparkles,
  Target,
  UsersRound,
} from 'lucide-react';
import { Link } from 'react-router';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import type { CrmRecord } from './data';
import { queryCollection, toScalarString } from './data';
import {
  currencyFormatter,
  dateTimeFormatter,
  toneClasses,
} from './formatters';
import { opportunityStages } from './resource-config';

const numberFromRow = (row: unknown, key: string) => {
  if (!row || typeof row !== 'object') return 0;
  const value = (row as Record<string, unknown>)[key];
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

function useCountMetric(
  resource: string,
  alias: string,
  filter?: Record<string, unknown>,
) {
  const allowed = useCanAccess({ resource, action: 'list' });
  return useQuery({
    queryKey: ['crm-dashboard', resource, alias, filter],
    enabled: allowed,
    retry: false,
    queryFn: ({ signal }) =>
      queryCollection(
        resource,
        {
          measures: [{ field: ['id'], aggregation: 'count', alias }],
          ...(filter ? { filter } : {}),
          limit: 1,
        },
        signal,
      ).then((rows) => numberFromRow(rows[0], alias)),
  });
}

function MetricCard({
  title,
  value,
  description,
  icon,
  loading,
}: {
  title: string;
  value: string;
  description: string;
  icon: React.ReactNode;
  loading?: boolean;
}) {
  return (
    <Card className='overflow-hidden border-border/80 shadow-sm'>
      <CardContent className='p-5'>
        <div className='flex items-start justify-between gap-4'>
          <div>
            <p className='text-sm text-muted-foreground'>{title}</p>
            {loading ? (
              <Skeleton className='mt-3 h-9 w-24' />
            ) : (
              <p className='mt-2 text-3xl font-semibold tracking-tight tabular-nums'>
                {value}
              </p>
            )}
            <p className='mt-2 text-xs leading-5 text-muted-foreground'>
              {description}
            </p>
          </div>
          <span className='flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary'>
            {icon}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function PipelinePanel() {
  const allowed = useCanAccess({
    resource: 'agent_crm_opportunities',
    action: 'list',
  });
  const pipeline = useQuery({
    queryKey: ['crm-dashboard', 'pipeline'],
    enabled: allowed,
    retry: false,
    queryFn: ({ signal }) =>
      queryCollection(
        'agent_crm_opportunities',
        {
          measures: [
            { field: ['id'], aggregation: 'count', alias: 'opportunity_count' },
            { field: ['amount'], aggregation: 'sum', alias: 'pipeline_amount' },
          ],
          dimensions: [{ field: ['stage'], alias: 'stage' }],
          orders: [{ field: ['stage'], alias: 'stage', order: 'asc' }],
        },
        signal,
      ),
  });
  const rows = new Map(
    (pipeline.data ?? []).map((row) => {
      const record = row as Record<string, unknown>;
      return [toScalarString(record.stage), record];
    }),
  );
  const activeStages = opportunityStages.filter(
    (stage) => stage.value !== 'won' && stage.value !== 'lost',
  );
  const total = activeStages.reduce(
    (sum, stage) =>
      sum + numberFromRow(rows.get(stage.value), 'pipeline_amount'),
    0,
  );

  return (
    <Card className='shadow-sm'>
      <CardHeader className='flex-row items-start justify-between gap-4'>
        <div>
          <CardTitle>销售管道</CardTitle>
          <p className='mt-1 text-sm text-muted-foreground'>
            按阶段汇总的商机金额与数量
          </p>
        </div>
        <Button
          nativeButton={false}
          variant='outline'
          size='sm'
          render={<Link to='/opportunities' />}
        >
          查看全部 <ArrowRight />
        </Button>
      </CardHeader>
      <CardContent>
        {pipeline.isLoading ? (
          <div className='grid gap-3 sm:grid-cols-3'>
            {[1, 2, 3].map((item) => (
              <Skeleton key={item} className='h-28' />
            ))}
          </div>
        ) : pipeline.isError ? (
          <p className='rounded-lg bg-muted p-4 text-sm text-muted-foreground'>
            暂时无法读取销售管道，请稍后重试。
          </p>
        ) : (
          <div className='grid gap-3 sm:grid-cols-3'>
            {activeStages.map((stage) => {
              const row = rows.get(stage.value);
              const amount = numberFromRow(row, 'pipeline_amount');
              const count = numberFromRow(row, 'opportunity_count');
              const share = total > 0 ? Math.round((amount / total) * 100) : 0;
              return (
                <div
                  key={stage.value}
                  className='rounded-xl border bg-muted/20 p-4'
                >
                  <div className='flex items-center justify-between gap-2'>
                    <Badge
                      variant='outline'
                      className={toneClasses[stage.tone]}
                    >
                      {stage.label}
                    </Badge>
                    <span className='text-xs text-muted-foreground'>
                      {count} 个
                    </span>
                  </div>
                  <p className='mt-4 text-lg font-semibold tabular-nums'>
                    {currencyFormatter.format(amount)}
                  </p>
                  <Progress value={share} className='mt-3 h-1.5' />
                  <p className='mt-2 text-xs text-muted-foreground'>
                    占活跃管道 {share}%
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function WorkQueue() {
  const canReadActivities = useCanAccess({
    resource: 'agent_crm_activities',
    action: 'list',
  });
  const canReadOpportunities = useCanAccess({
    resource: 'agent_crm_opportunities',
    action: 'list',
  });
  const activities = useList<CrmRecord>({
    resource: 'agent_crm_activities',
    pagination: { mode: 'server', currentPage: 1, pageSize: 5 },
    sorters: [{ field: 'dueAt', order: 'asc' }],
    filters: [{ field: 'status', operator: 'eq', value: 'planned' }],
    meta: { appends: ['opportunity', 'contact'] },
    queryOptions: { enabled: canReadActivities, retry: false },
  });
  const opportunities = useList<CrmRecord>({
    resource: 'agent_crm_opportunities',
    pagination: { mode: 'server', currentPage: 1, pageSize: 5 },
    sorters: [{ field: 'expectedCloseDate', order: 'asc' }],
    filters: [
      {
        field: 'stage',
        operator: 'nin',
        value: ['won', 'lost'],
      },
    ],
    meta: { appends: ['account', 'owner'] },
    queryOptions: { enabled: canReadOpportunities, retry: false },
  });

  return (
    <div className='grid gap-6 lg:grid-cols-2'>
      <Card className='shadow-sm'>
        <CardHeader className='flex-row items-center justify-between'>
          <CardTitle>下一步跟进</CardTitle>
          <Button
            nativeButton={false}
            variant='ghost'
            size='sm'
            render={<Link to='/activities' />}
          >
            全部任务 <ArrowRight />
          </Button>
        </CardHeader>
        <CardContent className='space-y-2'>
          {activities.query.isLoading ? (
            <Skeleton className='h-40' />
          ) : activities.query.isError ? (
            <p className='text-sm text-muted-foreground'>
              跟进任务暂时无法加载。
            </p>
          ) : activities.result.data.length === 0 ? (
            <p className='rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground'>
              当前没有待处理任务
            </p>
          ) : (
            activities.result.data.map((activity) => (
              <Link
                key={activity.id}
                to={`/activities/show/${activity.id}`}
                className='flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50'
              >
                <span className='flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary'>
                  <CalendarClock className='size-4' />
                </span>
                <span className='min-w-0 flex-1'>
                  <span className='block truncate text-sm font-medium'>
                    {toScalarString(activity.subject, '未命名任务')}
                  </span>
                  <span className='mt-0.5 block text-xs text-muted-foreground'>
                    {activity.dueAt
                      ? dateTimeFormatter.format(
                          new Date(toScalarString(activity.dueAt)),
                        )
                      : '未安排时间'}
                  </span>
                </span>
                <ArrowRight className='size-4 text-muted-foreground' />
              </Link>
            ))
          )}
        </CardContent>
      </Card>

      <Card className='shadow-sm'>
        <CardHeader className='flex-row items-center justify-between'>
          <CardTitle>临近成交</CardTitle>
          <Button
            nativeButton={false}
            variant='ghost'
            size='sm'
            render={<Link to='/opportunities' />}
          >
            商机管道 <ArrowRight />
          </Button>
        </CardHeader>
        <CardContent className='space-y-2'>
          {opportunities.query.isLoading ? (
            <Skeleton className='h-40' />
          ) : opportunities.query.isError ? (
            <p className='text-sm text-muted-foreground'>
              商机数据暂时无法加载。
            </p>
          ) : opportunities.result.data.length === 0 ? (
            <p className='rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground'>
              当前没有活跃商机
            </p>
          ) : (
            opportunities.result.data.map((opportunity) => (
              <Link
                key={opportunity.id}
                to={`/opportunities/show/${opportunity.id}`}
                className='flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50'
              >
                <span className='flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600'>
                  <Target className='size-4' />
                </span>
                <span className='min-w-0 flex-1'>
                  <span className='block truncate text-sm font-medium'>
                    {toScalarString(opportunity.name, '未命名商机')}
                  </span>
                  <span className='mt-0.5 block text-xs text-muted-foreground'>
                    {currencyFormatter.format(Number(opportunity.amount ?? 0))}
                  </span>
                </span>
                <ArrowRight className='size-4 text-muted-foreground' />
              </Link>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function CrmDashboard() {
  const activeLeads = useCountMetric('agent_crm_leads', 'active_leads', {
    status: { $in: ['new', 'contacted', 'nurturing'] },
  });
  const activeOpportunities = useCountMetric(
    'agent_crm_opportunities',
    'active_opportunities',
    { stage: { $notIn: ['won', 'lost'] } },
  );
  const plannedActivities = useCountMetric(
    'agent_crm_activities',
    'planned_activities',
    {
      status: 'planned',
    },
  );
  const strategicAccounts = useCountMetric(
    'agent_crm_accounts',
    'strategic_accounts',
    {
      tier: 'strategic',
    },
  );
  const hasModelError = [
    activeLeads,
    activeOpportunities,
    plannedActivities,
    strategicAccounts,
  ].some((query) => query.isError);

  return (
    <div className='space-y-7'>
      <div className='flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between'>
        <div>
          <div className='flex items-center gap-2 text-sm font-medium text-primary'>
            <Sparkles className='size-4' />
            Agent-built · NocoBase governed
          </div>
          <Badge className='mt-3 w-fit' variant='secondary'>
            Agent 更新 · Hub 受控发布
          </Badge>
          <h1 className='mt-2 text-3xl font-semibold tracking-[-0.035em]'>
            销售作战台
          </h1>
          <p className='mt-2 max-w-2xl text-sm leading-6 text-muted-foreground'>
            从线索到成交，把团队今天需要推进的工作集中在一个视图中。
          </p>
          <p className='mt-2 max-w-2xl text-xs leading-5 text-muted-foreground'>
            销售工作台信息层级已优化，并通过 Hub 受控发布上线。
          </p>
        </div>
        <Button nativeButton={false} render={<Link to='/leads/create' />}>
          新增销售线索
        </Button>
      </div>

      {hasModelError ? (
        <Alert variant='destructive'>
          <AlertTitle>CRM 数据模型尚未就绪</AlertTitle>
          <AlertDescription>
            应用源码已经连接
            NocoBase，请先在目标环境执行幂等模型同步并授予当前角色读取权限。
          </AlertDescription>
        </Alert>
      ) : null}

      <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
        <MetricCard
          title='待推进线索'
          value={String(activeLeads.data ?? 0)}
          description='待联系、已联系或持续培育'
          icon={<UsersRound className='size-5' />}
          loading={activeLeads.isLoading}
        />
        <MetricCard
          title='活跃商机'
          value={String(activeOpportunities.data ?? 0)}
          description='尚未赢单或输单的机会'
          icon={<Target className='size-5' />}
          loading={activeOpportunities.isLoading}
        />
        <MetricCard
          title='待办跟进'
          value={String(plannedActivities.data ?? 0)}
          description='需要销售继续执行的任务'
          icon={<CalendarClock className='size-5' />}
          loading={plannedActivities.isLoading}
        />
        <MetricCard
          title='战略客户'
          value={String(strategicAccounts.data ?? 0)}
          description='需要重点经营的核心客户'
          icon={<CircleDollarSign className='size-5' />}
          loading={strategicAccounts.isLoading}
        />
      </div>

      <PipelinePanel />

      <WorkQueue />
    </div>
  );
}
