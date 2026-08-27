import { ArrowRight, Blocks, Info, Settings2 } from 'lucide-react';
import type { ReactElement } from 'react';
import { Link } from 'react-router';

import { AppSettingsModuleIconView } from './icons.js';
import {
  APP_SETTINGS_GROUPS,
  type AppSettingsRegisteredModule,
} from './registry.js';
import { AppSettingsStatusBadge } from './status-badge.js';

export interface AppSettingsCenterProps {
  readonly modules: readonly AppSettingsRegisteredModule[];
  readonly basePath?: string;
}

export function AppSettingsCenter({
  modules,
  basePath = '/settings',
}: AppSettingsCenterProps): ReactElement {
  return (
    <div className='space-y-6'>
      <section className='relative overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-sm md:p-8'>
        <div className='absolute -top-20 -right-12 size-64 rounded-full border border-primary/10 bg-primary/5' />
        <div className='relative max-w-3xl'>
          <span className='inline-flex h-7 items-center gap-1.5 rounded-full border border-border bg-background/70 px-3 text-xs font-medium'>
            <Settings2 className='size-3.5' /> App 设置中心
          </span>
          <h1 className='mt-4 text-3xl font-semibold tracking-tight md:text-4xl'>
            管理 App 内部能力
          </h1>
          <p className='mt-3 max-w-2xl text-sm leading-6 text-muted-foreground md:text-base'>
            用户、权限、数据源、工作流等能力属于当前 App。预览版先明确模块入口、
            产品边界和接入状态，具体功能由各模块逐步接入。
          </p>
        </div>
      </section>

      <section className='flex gap-3 rounded-xl border border-border bg-card p-4 text-sm'>
        <Info className='mt-0.5 size-4 shrink-0 text-muted-foreground' />
        <div>
          <h2 className='font-medium'>这里是能力地图，不是模拟后台</h2>
          <p className='mt-1 leading-6 text-muted-foreground'>
            未接入的模块只展示说明和状态，不提供假的配置表单或保存结果。模块具备真实
            API、权限和运行时能力后，再替换为正式管理页面。
          </p>
        </div>
      </section>

      {APP_SETTINGS_GROUPS.map((group) => {
        const groupedModules = modules.filter(
          (module) => module.group === group,
        );
        if (groupedModules.length === 0) {
          return null;
        }
        return (
          <section key={group} className='space-y-3'>
            <div className='flex items-center gap-2'>
              <Blocks className='size-4 text-muted-foreground' />
              <h2 className='text-lg font-semibold'>{group}</h2>
              <span className='text-xs text-muted-foreground'>
                {groupedModules.length} 个模块
              </span>
            </div>
            <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-3'>
              {groupedModules.map((module) => (
                <AppSettingsModuleCard
                  basePath={basePath}
                  key={module.id}
                  module={module}
                />
              ))}
            </div>
          </section>
        );
      })}

      <section className='flex flex-col gap-4 rounded-xl border border-border bg-muted/20 p-5 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between'>
        <p className='max-w-3xl leading-6'>
          Hub 管理 App 的版本、发布、运行和资源绑定；这里管理 App 自身的用户、
          权限、数据和自动化能力。各功能插件通过注册机制贡献自己的设置入口。
        </p>
        <span className='w-fit shrink-0 rounded-full border border-border px-2.5 py-1 text-xs'>
          预览版产品结构
        </span>
      </section>
    </div>
  );
}

interface AppSettingsModuleCardProps {
  readonly basePath: string;
  readonly module: AppSettingsRegisteredModule;
}

function AppSettingsModuleCard({
  basePath,
  module,
}: AppSettingsModuleCardProps): ReactElement {
  return (
    <article className='group flex min-h-60 flex-col rounded-xl border border-border bg-card transition-colors hover:border-primary/30'>
      <div className='flex-1 p-5'>
        <div className='flex items-start justify-between gap-4'>
          <span className='grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary'>
            <AppSettingsModuleIconView className='size-5' icon={module.icon} />
          </span>
          <AppSettingsStatusBadge status={module.status} />
        </div>
        <h3 className='mt-4 font-semibold'>{module.title}</h3>
        <p className='mt-2 text-sm leading-5 text-muted-foreground'>
          {module.description}
        </p>
      </div>
      <div className='flex items-center justify-between gap-3 border-t border-border px-5 py-3'>
        <p className='truncate text-xs text-muted-foreground'>{module.owner}</p>
        <Link
          className='inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium hover:bg-muted'
          to={`${basePath}/${module.id}`}
        >
          {module.pageLoader ? '进入设置' : '查看说明'}{' '}
          <ArrowRight className='size-3.5' />
        </Link>
      </div>
    </article>
  );
}
