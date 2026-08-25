import { ArrowLeft, Boxes, CheckCircle2, Info } from 'lucide-react';
import type { ReactElement } from 'react';
import { Link } from 'react-router';

import { AppSettingsModuleIconView } from './icons.js';
import type { AppSettingsRegisteredModule } from './registry.js';
import { AppSettingsStatusBadge } from './status-badge.js';

export interface AppSettingsModuleOverviewProps {
  readonly module: AppSettingsRegisteredModule;
  readonly basePath?: string;
}

export function AppSettingsModuleOverview({
  module,
  basePath = '/settings',
}: AppSettingsModuleOverviewProps): ReactElement {
  return (
    <div className='space-y-6'>
      <div>
        <Link
          className='mb-2 -ml-2 inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-medium hover:bg-muted'
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
      </div>

      <section className='flex gap-3 rounded-xl border border-border bg-card p-4 text-sm'>
        <Info className='mt-0.5 size-4 shrink-0 text-muted-foreground' />
        <div>
          <h2 className='font-medium'>模块能力尚未正式接入</h2>
          <p className='mt-1 leading-6 text-muted-foreground'>
            本页用于确认产品位置和职责边界，不提供模拟数据、假配置或假保存。正式模块
            接入后，将在这个稳定路由下提供管理能力。
          </p>
        </div>
      </section>

      <div className='grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]'>
        <section className='rounded-xl border border-border bg-card'>
          <div className='flex items-center gap-3 border-b border-border p-5'>
            <span className='grid size-11 place-items-center rounded-xl bg-primary/10 text-primary'>
              <AppSettingsModuleIconView
                className='size-5'
                icon={module.icon}
              />
            </span>
            <div>
              <h2 className='font-semibold'>{module.title}</h2>
              <p className='text-sm text-muted-foreground'>{module.group}</p>
            </div>
          </div>
          <div className='space-y-5 p-5'>
            <DefinitionRow label='能力归属' value={module.owner} />
            <DefinitionRow label='当前状态' value={module.status} />
            <DefinitionRow label='职责边界' value={module.boundary} />
          </div>
        </section>

        <section className='rounded-xl border border-border bg-muted/20 p-5'>
          <h2 className='font-semibold'>接入要求</h2>
          <p className='mt-1 text-sm text-muted-foreground'>
            满足后再替换为真实管理页面
          </p>
          <div className='mt-4 space-y-3 text-sm'>
            <Requirement>模块提供稳定的前端入口和路由注册信息</Requirement>
            <Requirement>服务端 API、数据模型和权限边界已经明确</Requirement>
            <Requirement>页面展示真实状态，写操作由服务端校验</Requirement>
          </div>
          <span className='mt-4 inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs'>
            <Boxes className='size-3.5' /> 模块化接入
          </span>
        </section>
      </div>
    </div>
  );
}

interface DefinitionRowProps {
  readonly label: string;
  readonly value: string;
}

function DefinitionRow({ label, value }: DefinitionRowProps): ReactElement {
  return (
    <div>
      <p className='text-xs font-medium tracking-wide text-muted-foreground uppercase'>
        {label}
      </p>
      <p className='mt-1 text-sm leading-6'>{value}</p>
    </div>
  );
}

interface RequirementProps {
  readonly children: string;
}

function Requirement({ children }: RequirementProps): ReactElement {
  return (
    <div className='flex items-start gap-2 rounded-lg border border-border bg-background p-3'>
      <CheckCircle2 className='mt-0.5 size-4 shrink-0 text-muted-foreground' />
      <span className='leading-5'>{children}</span>
    </div>
  );
}
