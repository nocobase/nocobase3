import {
  AppSettingsStatusBadge,
  type AppSettingsModulePageProps,
} from '@nocobase/app-plugin-settings/client';
import {
  ArrowLeft,
  Braces,
  CheckCircle2,
  Database,
  Info,
  LockKeyhole,
  Route,
  ShieldCheck,
} from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';
import { Link } from 'react-router';

export default function AppDataSourceSettingsPage({
  basePath,
  module,
}: AppSettingsModulePageProps): ReactElement {
  return (
    <div className='space-y-6'>
      <header>
        <Link
          className='mb-3 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground'
          to={basePath}
        >
          <ArrowLeft className='size-4' /> 返回设置中心
        </Link>
        <div className='flex flex-wrap items-center gap-2'>
          <h1 className='text-3xl font-semibold tracking-tight'>
            {module.title}
          </h1>
          <AppSettingsStatusBadge status={module.status} />
        </div>
        <p className='mt-2 max-w-3xl text-sm leading-6 text-muted-foreground'>
          {module.description}
        </p>
      </header>

      <section className='flex gap-3 rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 text-sm'>
        <Info className='mt-0.5 size-4 shrink-0 text-blue-600' />
        <div>
          <h2 className='font-medium'>当前接入的是数据访问适配器</h2>
          <p className='mt-1 max-w-4xl leading-6 text-muted-foreground'>
            它把 App 页面中的数据操作转换为 NocoBase Resource Action
            请求，并衔接分页、筛选、排序和记录权限。当前模块不是数据源连接管理后台。
          </p>
        </div>
      </section>

      <section className='overflow-hidden rounded-xl border border-border bg-card'>
        <header className='flex flex-wrap items-center justify-between gap-4 border-b border-border p-5'>
          <div className='flex items-center gap-3'>
            <span className='grid size-11 place-items-center rounded-xl bg-primary/10 text-primary'>
              <Database className='size-5' />
            </span>
            <div>
              <h2 className='font-semibold'>NocoBase Data Provider</h2>
              <p className='text-sm text-muted-foreground'>
                App Runtime 的统一数据访问层
              </p>
            </div>
          </div>
          <span className='inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/5 px-2.5 py-1 text-xs text-emerald-700 dark:text-emerald-300'>
            <CheckCircle2 className='size-3.5' /> 已注册
          </span>
        </header>

        <div className='grid gap-px bg-border md:grid-cols-2'>
          <Capability
            description='支持列表、单条和多条读取，并转换分页、筛选、排序、字段与关联字段参数。'
            icon={<Braces className='size-5' />}
            title='数据查询'
          >
            getList · getOne · getMany
          </Capability>
          <Capability
            description='支持新增、更新和删除；多条操作由适配层向对应 Resource Action 逐条发起请求。'
            icon={<Database className='size-5' />}
            title='数据写入'
          >
            create · update · delete
          </Capability>
          <Capability
            description='调用方传入 dataSourceKey 时，适配器通过 X-Data-Source 请求头把目标数据源交给服务端解析。'
            icon={<Route className='size-5' />}
            title='数据源路由'
          >
            meta.dataSourceKey
          </Capability>
          <Capability
            description='读取接口返回的 allowedActions，并按数据源、资源和记录缓存可执行操作。'
            icon={<ShieldCheck className='size-5' />}
            title='权限衔接'
          >
            allowedActions · Record ACL
          </Capability>
        </div>
      </section>

      <section className='rounded-xl border border-border bg-card p-5'>
        <div className='flex items-center gap-3'>
          <span className='grid size-10 place-items-center rounded-xl bg-muted text-muted-foreground'>
            <LockKeyhole className='size-5' />
          </span>
          <div>
            <h2 className='font-semibold'>当前能力边界</h2>
            <p className='text-sm text-muted-foreground'>
              以下能力没有在本模块中实现
            </p>
          </div>
        </div>
        <div className='mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3'>
          <Boundary>查看或发现数据源列表</Boundary>
          <Boundary>新增、编辑或删除连接</Boundary>
          <Boundary>连接测试与运行状态监控</Boundary>
          <Boundary>数据库凭证与驱动配置</Boundary>
          <Boundary>数据表和字段建模</Boundary>
          <Boundary>外部数据源生命周期管理</Boundary>
        </div>
      </section>
    </div>
  );
}

interface CapabilityProps {
  readonly children: string;
  readonly description: string;
  readonly icon: ReactNode;
  readonly title: string;
}

function Capability({
  children,
  description,
  icon,
  title,
}: CapabilityProps): ReactElement {
  return (
    <article className='bg-card p-5'>
      <div className='flex items-center gap-2.5'>
        <span className='grid size-9 place-items-center rounded-lg bg-muted text-muted-foreground'>
          {icon}
        </span>
        <h3 className='font-medium'>{title}</h3>
      </div>
      <p className='mt-3 text-sm leading-6 text-muted-foreground'>
        {description}
      </p>
      <code className='mt-3 block text-xs text-foreground'>{children}</code>
    </article>
  );
}

function Boundary({ children }: { readonly children: string }): ReactElement {
  return (
    <div className='rounded-lg border border-border bg-muted/20 px-3 py-2.5 text-sm text-muted-foreground'>
      {children}
    </div>
  );
}
