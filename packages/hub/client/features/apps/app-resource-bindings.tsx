import { useLink } from '@refinedev/core';
import {
  AlertCircle,
  ArrowLeft,
  Braces,
  CheckCircle2,
  ChevronDown,
  CircleDashed,
  Clock3,
  Database,
  ExternalLink,
  HardDrive,
  Info,
  Network,
  RefreshCw,
  RotateCw,
  type LucideIcon,
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import type { AppRuntimeResourceSummary } from '@nocobase/hub-release-management/types';
import { formatDateTime } from './presentation';

export interface AppResourceBindingsProps {
  appId: string;
  appName: string;
  accessUrl?: string | null;
  runtimeResources?: readonly AppRuntimeResourceSummary[];
  loading?: boolean;
  error?: string | null;
  onRefresh?: () => void;
}

type ResourceBindingStatus =
  | 'module-unavailable'
  | 'unbound'
  | 'applying'
  | 'active'
  | 'restart-required'
  | 'error';

interface ResourceBindingDefinition {
  id: string;
  title: string;
  description: string;
  owner: string;
  status: ResourceBindingStatus;
  icon: LucideIcon;
  resourceName?: string;
  updatedAt?: string;
  runtimeInfo?: string;
  runtimeError?: string;
}

interface ResourceBindingStatusDefinition {
  label: string;
  description: string;
  icon: LucideIcon;
  className?: string;
}

const statusDefinitions: Record<
  ResourceBindingStatus,
  ResourceBindingStatusDefinition
> = {
  'module-unavailable': {
    label: '暂不可配置',
    description: '相关模块尚未提供配置能力。',
    icon: CircleDashed,
  },
  unbound: {
    label: '待配置',
    description: '相关模块已经可用，当前 App 尚未选择资源。',
    icon: Clock3,
    className:
      'border-amber-500/25 bg-amber-500/5 text-amber-700 dark:text-amber-300',
  },
  applying: {
    label: '应用中',
    description: 'Runtime 正在应用最新的资源配置。',
    icon: RefreshCw,
    className:
      'border-blue-500/25 bg-blue-500/5 text-blue-700 dark:text-blue-300',
  },
  active: {
    label: '已生效',
    description: 'Runtime 已确认当前资源配置生效。',
    icon: CheckCircle2,
    className:
      'border-emerald-500/25 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300',
  },
  'restart-required': {
    label: '需重启',
    description: '资源配置已经更新，需要重启 App 后生效。',
    icon: RotateCw,
    className:
      'border-orange-500/25 bg-orange-500/5 text-orange-700 dark:text-orange-300',
  },
  error: {
    label: '异常',
    description: 'Runtime 应用资源配置失败，需要处理。',
    icon: AlertCircle,
    className: 'border-destructive/25 bg-destructive/5 text-destructive',
  },
};

const resourceBindingDefinitions: readonly ResourceBindingDefinition[] = [
  {
    id: 'database',
    title: '数据库',
    description: '业务数据使用的数据库连接或数据源。',
    owner: '数据库模块',
    status: 'module-unavailable',
    icon: Database,
  },
  {
    id: 'files',
    title: '文件存储',
    description: 'Files / Drive 使用的底层存储资源。',
    owner: '文件模块',
    status: 'module-unavailable',
    icon: HardDrive,
  },
  {
    id: 'cache-queue',
    title: '缓存与队列',
    description: 'App 运行使用的共享缓存和异步任务资源。',
    owner: 'Runtime 基础服务',
    status: 'module-unavailable',
    icon: Network,
  },
  {
    id: 'runtime-config',
    title: '运行配置',
    description: 'App 运行需要的环境配置与密钥引用。',
    owner: 'App Runtime',
    status: 'module-unavailable',
    icon: Braces,
  },
];

export default function AppResourceBindings({
  appId,
  appName,
  accessUrl,
  runtimeResources = [],
  loading = false,
  error = null,
  onRefresh,
}: AppResourceBindingsProps) {
  const Link = useLink();
  const appRoot = `/apps/${encodeURIComponent(appId)}`;
  const resourceBindings = resolveResourceBindings(runtimeResources);
  const database = resourceBindings.find(
    (resource) => resource.id === 'database',
  );
  const configurationUnavailableCount = resourceBindings.length;
  const activeCount = resourceBindings.filter(
    (resource) => resource.status === 'active',
  ).length;
  const databaseContentUrl =
    database?.status === 'active'
      ? resolveDatabaseContentUrl(appId, accessUrl)
      : null;

  return (
    <div className='space-y-6'>
      <div>
        <Button
          variant='ghost'
          size='sm'
          className='mb-2 -ml-2'
          render={<Link to={appRoot} />}
          nativeButton={false}
        >
          <ArrowLeft /> 返回 App 概览
        </Button>
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <div className='flex flex-wrap items-center gap-2'>
            <h1 className='font-heading text-3xl font-semibold tracking-tight'>
              运行资源
            </h1>
            <Badge variant='outline'>能力预览</Badge>
          </div>
          {onRefresh ? (
            <Button
              variant='outline'
              size='sm'
              onClick={onRefresh}
              disabled={loading}
            >
              <RefreshCw className={cn(loading && 'animate-spin')} /> 刷新状态
            </Button>
          ) : null}
        </div>
        <p className='mt-2 max-w-3xl text-sm leading-6 text-muted-foreground'>
          查看和管理 {appName} 运行所需的数据库、文件存储、缓存队列和运行配置。
        </p>
      </div>

      {error ? (
        <Alert variant='destructive'>
          <AlertCircle />
          <AlertTitle>无法读取运行资源</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : database?.status === 'active' ? (
        <Alert>
          <CheckCircle2 />
          <AlertTitle>主数据库已接通</AlertTitle>
          <AlertDescription>
            Runtime 已确认 {database.resourceName} 可用，Hub 展示的是当前 App
            实际生效的数据库资源，不包含密码、文件路径或连接串。当前版本暂不提供连接切换或编辑。
          </AlertDescription>
        </Alert>
      ) : database?.status === 'error' ? (
        <Alert variant='destructive'>
          <AlertCircle />
          <AlertTitle>主数据库状态异常</AlertTitle>
          <AlertDescription>
            {database.runtimeError ?? 'Runtime 未能确认当前主数据库可用。'}
          </AlertDescription>
        </Alert>
      ) : (
        <Alert>
          <Info />
          <AlertTitle>数据库配置暂不可用</AlertTitle>
          <AlertDescription>
            “暂不可配置”表示相关模块尚未提供配置能力，不是 {appName}
            遗漏了配置。模块接入后，可以在这里选择资源并查看是否已经生效。
          </AlertDescription>
        </Alert>
      )}

      <section className='space-y-3' aria-label={`${appName} 运行资源状态`}>
        <div className='flex flex-wrap items-end justify-between gap-3'>
          <div>
            <h2 className='font-heading text-lg font-semibold'>资源状态</h2>
            <p className='mt-1 text-sm text-muted-foreground'>
              统一展示各项资源当前是否可用，以及运行时是否已经生效。
            </p>
          </div>
          <div className='flex gap-2 text-xs'>
            <Badge variant='outline'>{resourceBindings.length} 类资源</Badge>
            <Badge variant='outline'>{activeCount} 项已生效</Badge>
            <Badge variant='outline'>
              {configurationUnavailableCount} 项配置入口暂未开放
            </Badge>
          </div>
        </div>

        <div className='grid gap-4 md:grid-cols-2'>
          {resourceBindings.map((resource) => (
            <ResourceBindingCard
              key={resource.id}
              resource={resource}
              appName={appName}
              contentUrl={
                resource.id === 'database' ? databaseContentUrl : null
              }
            />
          ))}
        </div>
      </section>

      <ResourceBindingGuide />
    </div>
  );
}

function ResourceBindingCard({
  resource,
  appName,
  contentUrl,
}: {
  resource: ResourceBindingDefinition;
  appName: string;
  contentUrl: string | null;
}) {
  const Icon = resource.icon;
  const status = statusDefinitions[resource.status];

  return (
    <Card>
      <CardHeader>
        <div className='flex items-start justify-between gap-4'>
          <div className='flex items-start gap-3'>
            <div className='grid size-10 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground'>
              <Icon className='size-5' />
            </div>
            <div>
              <CardTitle>{resource.title}</CardTitle>
              <CardDescription className='mt-1 leading-5'>
                {resource.description}
              </CardDescription>
            </div>
          </div>
          <ResourceStatusBadge status={resource.status} />
        </div>
      </CardHeader>
      <CardContent className='space-y-4 border-t pt-4'>
        <p className='text-xs leading-5 text-muted-foreground'>
          {resource.runtimeError ?? status.description}
        </p>
        <dl className='grid grid-cols-2 gap-3 text-sm'>
          <ResourceDetail
            label='当前使用'
            value={resource.resourceName ?? '—'}
          />
          <ResourceDetail label='最后更新' value={resource.updatedAt ?? '—'} />
          {resource.runtimeInfo ? (
            <ResourceDetail
              label='运行信息'
              value={resource.runtimeInfo}
              className='col-span-2'
            />
          ) : null}
          <ResourceDetail
            label='配置入口'
            value='暂未开放'
            className='col-span-2'
          />
          <ResourceDetail
            label='配置归属'
            value={resource.owner}
            className='col-span-2'
          />
        </dl>
        {contentUrl ? (
          <div className='flex flex-col gap-3 rounded-xl border bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between'>
            <div>
              <p className='text-sm font-medium'>连接已验证，可以继续看数据</p>
              <p className='mt-1 text-xs leading-5 text-muted-foreground'>
                进入 {appName} 查看真实业务表、记录数量和数据内容。
              </p>
            </div>
            <Button
              size='sm'
              nativeButton={false}
              render={<a href={contentUrl} target='_blank' rel='noreferrer' />}
            >
              查看真实数据 <ExternalLink />
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function resolveDatabaseContentUrl(
  appId: string,
  accessUrl: string | null | undefined,
): string | null {
  if (!accessUrl) return null;
  if (appId !== 'crm') return accessUrl;
  return `${accessUrl.replace(/\/+$/, '')}/settings/data-sources`;
}

function resolveResourceBindings(
  runtimeResources: readonly AppRuntimeResourceSummary[],
): readonly ResourceBindingDefinition[] {
  const database = runtimeResources.find(
    (resource) =>
      resource.kind === 'database' && resource.id === 'database:primary',
  );
  if (!database) return resourceBindingDefinitions;

  return resourceBindingDefinitions.map((definition) => {
    if (definition.id !== 'database') return definition;
    const dialect = stringDetail(database, 'dialect');
    const driver = stringDetail(database, 'driver');
    return {
      ...definition,
      status: database.status,
      resourceName: database.name,
      updatedAt: formatDateTime(database.updatedAt),
      runtimeInfo: [formatDialect(dialect), driver].filter(Boolean).join(' · '),
      runtimeError: database.error?.message,
    };
  });
}

function stringDetail(
  resource: AppRuntimeResourceSummary,
  key: string,
): string | undefined {
  const value = resource.details?.[key];
  return typeof value === 'string' ? value : undefined;
}

function formatDialect(value: string | undefined): string | undefined {
  if (value === 'sqlite') return 'SQLite';
  if (value === 'postgres') return 'PostgreSQL';
  if (value === 'mysql') return 'MySQL';
  return value;
}

function ResourceStatusBadge({ status }: { status: ResourceBindingStatus }) {
  const definition = statusDefinitions[status];
  const StatusIcon = definition.icon;

  return (
    <Badge variant='outline' className={cn('shrink-0', definition.className)}>
      <StatusIcon /> {definition.label}
    </Badge>
  );
}

function ResourceDetail({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className='text-xs text-muted-foreground'>{label}</dt>
      <dd className='mt-1 font-medium'>{value}</dd>
    </div>
  );
}

function ResourceBindingGuide() {
  return (
    <Collapsible>
      <Card className='bg-muted/20'>
        <CollapsibleTrigger className='flex w-full items-center justify-between gap-4 px-5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50'>
          <div>
            <p className='font-medium'>了解运行资源</p>
            <p className='mt-1 text-xs text-muted-foreground'>
              查看状态含义、配置方式和管理边界
            </p>
          </div>
          <ChevronDown className='size-4 shrink-0 text-muted-foreground' />
        </CollapsibleTrigger>
        <CollapsibleContent className='border-t px-5 pt-5'>
          <div className='grid gap-6 lg:grid-cols-2'>
            <div>
              <h3 className='font-medium'>状态说明</h3>
              <div className='mt-3 grid gap-3 sm:grid-cols-2'>
                {(
                  [
                    'module-unavailable',
                    'unbound',
                    'applying',
                    'active',
                    'restart-required',
                    'error',
                  ] as const
                ).map((status) => (
                  <div
                    key={status}
                    className='rounded-lg border bg-background p-3'
                  >
                    <ResourceStatusBadge status={status} />
                    <p className='mt-2 text-xs leading-5 text-muted-foreground'>
                      {statusDefinitions[status].description}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className='space-y-5'>
              <div>
                <h3 className='font-medium'>接入流程</h3>
                <ol className='mt-3 grid gap-3 text-sm'>
                  <GuideStep
                    index='01'
                    title='模块注册资源'
                    description='模块创建资源，并维护连接信息和凭证。'
                  />
                  <GuideStep
                    index='02'
                    title='App 选择资源'
                    description='Hub 为 App 保存资源引用，不重复保存模块配置。'
                  />
                  <GuideStep
                    index='03'
                    title='Runtime 应用'
                    description='运行时应用绑定，并回报成功、异常或需重启。'
                  />
                </ol>
              </div>
              <div className='rounded-xl border bg-background p-4 text-sm leading-6'>
                <h3 className='font-medium'>管理边界</h3>
                <p className='mt-2 text-muted-foreground'>
                  Hub 管理资源引用、App
                  使用关系和生效状态；对应模块管理资源创建、驱动、凭证和业务规则。
                </p>
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

function GuideStep({
  index,
  title,
  description,
}: {
  index: string;
  title: string;
  description: string;
}) {
  return (
    <li className='flex gap-3 rounded-xl border bg-background p-3'>
      <span className='font-mono text-xs font-semibold text-primary'>
        {index}
      </span>
      <div>
        <p className='font-medium'>{title}</p>
        <p className='mt-1 text-xs leading-5 text-muted-foreground'>
          {description}
        </p>
      </div>
    </li>
  );
}
