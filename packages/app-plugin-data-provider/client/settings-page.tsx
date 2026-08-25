import { useAppClient } from '@nocobase/app-client';
import {
  AppSettingsStatusBadge,
  type AppSettingsModulePageProps,
} from '@nocobase/app-plugin-settings/client';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Database,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { Link } from 'react-router';

import {
  getAppDataSourceSettings,
  type AppDataSourceCollection,
} from './settings-configuration.js';

interface DatabaseRuntimeResource {
  readonly id: string;
  readonly kind: string;
  readonly name: string;
  readonly status: 'active' | 'error';
  readonly updatedAt: string;
  readonly details?: Readonly<Record<string, unknown>>;
  readonly error?: { readonly message: string } | null;
}

interface DatabaseRecordPreview {
  readonly id: string | number;
  readonly label: string;
  readonly secondary: string | null;
}

interface DatabaseCollectionOverview {
  readonly name: string;
  readonly count: number;
  readonly preview: readonly DatabaseRecordPreview[];
}

interface DatabaseOverview {
  readonly collections: readonly DatabaseCollectionOverview[];
  readonly totalRecords: number;
}

export default function AppDataSourceSettingsPage({
  basePath,
  module,
}: AppSettingsModulePageProps): ReactElement {
  const client = useAppClient();
  const settings = getAppDataSourceSettings(client);
  const [resource, setResource] = useState<DatabaseRuntimeResource | null>(
    null,
  );
  const [overview, setOverview] = useState<DatabaseOverview | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    setBusy(true);
    try {
      const [resources, databaseOverview] = await Promise.all([
        client.request<{ data: DatabaseRuntimeResource[] }>(
          '/runtime:resources',
        ),
        client.request<{ data: DatabaseOverview }>(
          '/runtime:database-overview',
        ),
      ]);
      const primary =
        resources.data.find(
          (item) => item.kind === 'database' && item.id === 'database:primary',
        ) ?? resources.data[0];
      if (!primary) throw new Error('Runtime 未返回主数据库资源。');
      setResource(primary);
      setOverview(databaseOverview.data);
      setError(null);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : '无法读取主数据库状态',
      );
    } finally {
      setBusy(false);
    }
  }, [client]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  const collections = resolveCollections(settings.collections, overview);
  return (
    <div className='space-y-6'>
      <header>
        <Link
          className='mb-3 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground'
          to={basePath}
        >
          <ArrowLeft className='size-4' /> 返回设置中心
        </Link>
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <div>
            <div className='flex flex-wrap items-center gap-2'>
              <h1 className='text-3xl font-semibold tracking-tight'>
                {module.title}
              </h1>
              <AppSettingsStatusBadge status={module.status} />
            </div>
            <p className='mt-2 max-w-3xl text-sm leading-6 text-muted-foreground'>
              {settings.description}
            </p>
          </div>
          <button
            className='inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-medium hover:bg-muted disabled:opacity-50'
            disabled={busy}
            onClick={() => void refresh()}
            type='button'
          >
            <RefreshCw className={`size-4 ${busy ? 'animate-spin' : ''}`} />
            重新检查连接
          </button>
        </div>
      </header>

      {error || resource?.status === 'error' ? (
        <section className='flex gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive'>
          <AlertCircle className='size-5 shrink-0' />
          <div>
            <strong>主数据库状态异常</strong>
            <p className='mt-1'>
              {error ??
                resource?.error?.message ??
                'Runtime 未能确认连接可用。'}
            </p>
          </div>
        </section>
      ) : null}

      {busy && !resource ? (
        <div className='grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]'>
          <div className='h-72 animate-pulse rounded-xl bg-muted' />
          <div className='h-72 animate-pulse rounded-xl bg-muted' />
        </div>
      ) : (
        <div className='grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]'>
          <section className='rounded-xl border border-border bg-card'>
            <header className='flex items-center justify-between gap-3 border-b border-border p-5'>
              <div className='flex items-center gap-3'>
                <span className='grid size-11 place-items-center rounded-xl bg-primary/10 text-primary'>
                  <Database className='size-5' />
                </span>
                <div>
                  <p className='text-sm text-muted-foreground'>主数据源</p>
                  <h2 className='font-semibold'>
                    {resource?.name ?? '主数据库'}
                  </h2>
                </div>
              </div>
              <span className='inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/5 px-2.5 py-1 text-xs text-emerald-700'>
                <CheckCircle2 className='size-3.5' /> 连接正常
              </span>
            </header>
            <div className='space-y-5 p-5'>
              <div className='grid gap-3 sm:grid-cols-3'>
                <SummaryItem
                  label='业务数据集'
                  value={overview ? String(overview.collections.length) : '—'}
                  detail='当前 App 数据'
                />
                <SummaryItem
                  label='当前记录'
                  value={overview ? String(overview.totalRecords) : '—'}
                  detail='实时统计'
                />
                <SummaryItem
                  label='最近检查'
                  value={formatDateTime(resource?.updatedAt)}
                  detail='Runtime 连通性检查'
                  compact
                />
              </div>
              <details className='rounded-xl border border-border bg-muted/20 px-4 py-3'>
                <summary className='cursor-pointer select-none text-sm font-medium'>
                  查看技术信息
                </summary>
                <div className='mt-4 grid gap-5 border-t border-border pt-4 sm:grid-cols-3'>
                  <DefinitionRow
                    label='数据库类型'
                    value={formatDialect(detail(resource, 'dialect'))}
                  />
                  <DefinitionRow
                    label='连接名称'
                    value={detail(resource, 'connectionName')}
                  />
                  <DefinitionRow
                    label='数据库驱动'
                    value={detail(resource, 'driver')}
                  />
                </div>
              </details>
            </div>
          </section>

          <section className='rounded-xl border border-border bg-muted/20 p-5'>
            <span className='grid size-10 place-items-center rounded-xl bg-primary/10 text-primary'>
              <ShieldCheck className='size-5' />
            </span>
            <h2 className='mt-4 font-semibold'>使用与安全</h2>
            <p className='mt-1 text-sm text-muted-foreground'>
              这个数据源如何服务当前 App
            </p>
            <div className='mt-4 space-y-4 text-sm leading-6'>
              <UsageItem>为当前 App 页面、API 和服务提供业务数据</UsageItem>
              <UsageItem>连接凭证由服务端保管，页面不返回敏感信息</UsageItem>
              <UsageItem muted>
                预览版暂不支持在 App 内新增或切换数据源
              </UsageItem>
            </div>
          </section>
        </div>
      )}

      {overview ? (
        <section className='space-y-4' aria-label='主数据源业务数据'>
          <div className='flex flex-wrap items-end justify-between gap-3'>
            <div>
              <h2 className='text-xl font-semibold'>业务数据</h2>
              <p className='mt-1 text-sm text-muted-foreground'>
                确认这个数据源正在承载哪些数据；具体记录回到对应业务页面管理。
              </p>
            </div>
            <div className='flex gap-2 text-xs'>
              <span className='rounded-full border border-border px-2.5 py-1'>
                {overview.collections.length} 个数据集
              </span>
              <span className='rounded-full border border-border px-2.5 py-1'>
                {overview.totalRecords} 条记录
              </span>
            </div>
          </div>
          <div className='divide-y divide-border rounded-xl border border-border bg-card'>
            {collections.map(({ definition, overview: collection }) => (
              <CollectionRow
                collection={collection}
                definition={definition}
                key={collection.name}
              />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function CollectionRow({
  collection,
  definition,
}: {
  collection: DatabaseCollectionOverview;
  definition: AppDataSourceCollection;
}): ReactElement {
  return (
    <div className='flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center'>
      <div className='flex min-w-0 flex-1 items-center gap-3'>
        <span className='grid size-10 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground'>
          <Database className='size-5' />
        </span>
        <div className='min-w-0'>
          <p className='font-medium'>{definition.title}</p>
          <p className='mt-0.5 truncate text-xs text-muted-foreground'>
            {definition.description}
          </p>
        </div>
      </div>
      <div className='flex items-center justify-between gap-4 sm:justify-end'>
        <div className='text-right'>
          <p className='font-medium tabular-nums'>{collection.count}</p>
          <p className='text-xs text-muted-foreground'>条记录</p>
        </div>
        {definition.route ? (
          <Link
            className='inline-flex h-8 items-center gap-1 rounded-md px-2.5 text-sm font-medium hover:bg-muted'
            to={definition.route}
          >
            管理数据 <ArrowRight className='size-4' />
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function SummaryItem({
  compact = false,
  detail: summaryDetail,
  label,
  value,
}: {
  compact?: boolean;
  detail: string;
  label: string;
  value: string;
}): ReactElement {
  return (
    <div className='rounded-xl border border-border bg-muted/20 p-4'>
      <p className='text-xs text-muted-foreground'>{label}</p>
      <p
        className={
          compact
            ? 'mt-1 text-sm font-semibold leading-7'
            : 'mt-1 text-2xl font-semibold'
        }
      >
        {value}
      </p>
      <p className='mt-1 text-xs text-muted-foreground'>{summaryDetail}</p>
    </div>
  );
}

function DefinitionRow({
  label,
  value,
}: {
  label: string;
  value?: string;
}): ReactElement {
  return (
    <div>
      <p className='text-xs font-medium uppercase tracking-wide text-muted-foreground'>
        {label}
      </p>
      <p className='mt-1 text-sm leading-6'>{value || '—'}</p>
    </div>
  );
}

function UsageItem({
  children,
  muted = false,
}: {
  children: string;
  muted?: boolean;
}): ReactElement {
  return (
    <div className='flex items-start gap-2.5'>
      <CheckCircle2
        className={
          muted
            ? 'mt-1 size-4 shrink-0 text-muted-foreground'
            : 'mt-1 size-4 shrink-0 text-emerald-600'
        }
      />
      <p className={muted ? 'text-muted-foreground' : undefined}>{children}</p>
    </div>
  );
}

function resolveCollections(
  definitions: readonly AppDataSourceCollection[],
  overview: DatabaseOverview | null,
): Array<{
  definition: AppDataSourceCollection;
  overview: DatabaseCollectionOverview;
}> {
  if (!overview) return [];
  const definitionByName = new Map(
    definitions.map((definition) => [definition.name, definition]),
  );
  return overview.collections.map((collection) => ({
    overview: collection,
    definition:
      definitionByName.get(collection.name) ??
      Object.freeze({
        name: collection.name,
        title: collection.name,
        description: '当前 App 业务数据集',
      }),
  }));
}

function detail(
  resource: DatabaseRuntimeResource | null,
  key: string,
): string | undefined {
  const value = resource?.details?.[key];
  return typeof value === 'string' ? value : undefined;
}

function formatDialect(value: string | undefined): string | undefined {
  if (value === 'sqlite') return 'SQLite';
  if (value === 'postgres') return 'PostgreSQL';
  if (value === 'mysql') return 'MySQL';
  return value;
}

function formatDateTime(value: string | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}
