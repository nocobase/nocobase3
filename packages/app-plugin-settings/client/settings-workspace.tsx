import { ArrowLeft, LayoutGrid, Settings2 } from 'lucide-react';
import type { PropsWithChildren, ReactElement } from 'react';
import { Link, useLocation } from 'react-router';

import { AppSettingsModuleIconView } from './icons.js';
import {
  APP_SETTINGS_GROUPS,
  type AppSettingsRegisteredModule,
} from './registry.js';

export interface AppSettingsWorkspaceProps extends PropsWithChildren {
  readonly modules: readonly AppSettingsRegisteredModule[];
  readonly appName?: string;
  readonly basePath?: string;
  readonly returnPath?: string;
}

export function AppSettingsWorkspace({
  appName = 'NocoBase App',
  basePath = '/settings',
  children,
  modules,
  returnPath = '/',
}: AppSettingsWorkspaceProps): ReactElement {
  const location = useLocation();

  return (
    <div className='min-h-svh bg-muted/25 text-foreground'>
      <header className='sticky top-0 z-40 flex h-16 items-center justify-between gap-4 border-b border-border bg-background/90 px-4 backdrop-blur-xl md:px-6'>
        <div className='flex min-w-0 items-center gap-3'>
          <span className='grid size-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground'>
            <Settings2 className='size-4' />
          </span>
          <div className='min-w-0'>
            <p className='truncate text-sm font-semibold'>{appName} 设置中心</p>
            <p className='hidden text-xs text-muted-foreground sm:block'>
              App 管理工作区
            </p>
          </div>
        </div>
        <Link
          className='inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-medium hover:bg-muted'
          to={returnPath}
        >
          <ArrowLeft className='size-4' />
          <span className='hidden sm:inline'>返回应用</span>
          <span className='sr-only sm:hidden'>返回应用</span>
        </Link>
      </header>

      <div className='mx-auto grid min-h-[calc(100svh-4rem)] max-w-[1800px] md:grid-cols-[248px_minmax(0,1fr)]'>
        <aside className='hidden border-r border-border bg-card/70 p-4 md:block'>
          <nav aria-label='App 设置导航' className='space-y-5'>
            <SettingsNavigationLink
              active={location.pathname === basePath}
              icon={<LayoutGrid className='size-4' />}
              label='设置概览'
              to={basePath}
            />
            {APP_SETTINGS_GROUPS.map((group) => {
              const groupedModules = modules.filter(
                (module) => module.group === group,
              );
              if (groupedModules.length === 0) {
                return null;
              }
              return (
                <section key={group} className='space-y-1'>
                  <h2 className='px-3 pb-1 text-[11px] font-semibold tracking-wide text-muted-foreground'>
                    {group}
                  </h2>
                  {groupedModules.map((module) => (
                    <SettingsNavigationLink
                      active={location.pathname === `${basePath}/${module.id}`}
                      icon={
                        <AppSettingsModuleIconView
                          className='size-4'
                          icon={module.icon}
                        />
                      }
                      key={module.id}
                      label={module.title}
                      to={`${basePath}/${module.id}`}
                    />
                  ))}
                </section>
              );
            })}
          </nav>
        </aside>

        <main className='min-w-0 px-4 py-5 md:p-6 lg:px-8 lg:py-7'>
          <div className='mx-auto w-full max-w-[1450px]'>{children}</div>
        </main>
      </div>
    </div>
  );
}

interface SettingsNavigationLinkProps {
  readonly active: boolean;
  readonly icon: ReactElement;
  readonly label: string;
  readonly to: string;
}

function SettingsNavigationLink({
  active,
  icon,
  label,
  to,
}: SettingsNavigationLinkProps): ReactElement {
  return (
    <Link
      aria-current={active ? 'page' : undefined}
      className={`flex h-10 items-center gap-3 rounded-lg px-3 text-sm transition-colors ${
        active
          ? 'bg-primary/10 font-medium text-primary'
          : 'text-foreground hover:bg-muted'
      }`}
      to={to}
    >
      {icon}
      <span className='truncate'>{label}</span>
    </Link>
  );
}
