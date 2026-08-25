import { ArrowLeft, RouteOff } from 'lucide-react';
import { createElement, type ReactElement, useEffect, useState } from 'react';
import { Link } from 'react-router';

import type {
  AppSettingsModulePageModule,
  AppSettingsRegisteredModule,
} from './registry.js';
import { AppSettingsModuleOverview } from './settings-module.js';

export interface AppSettingsModuleContentProps {
  readonly module: AppSettingsRegisteredModule | undefined;
  readonly basePath?: string;
}

export function AppSettingsModuleContent({
  basePath = '/settings',
  module,
}: AppSettingsModuleContentProps): ReactElement {
  const [loadState, setLoadState] = useState<AppSettingsModuleLoadState>({});

  useEffect(() => {
    let active = true;
    if (!module?.pageLoader) {
      return () => {
        active = false;
      };
    }

    module.pageLoader().then(
      (loadedModule) => {
        if (active && typeof loadedModule.default === 'function') {
          setLoadState({ loader: module.pageLoader, page: loadedModule });
        } else if (active) {
          setLoadState({ error: true, loader: module.pageLoader });
        }
      },
      () => {
        if (active) {
          setLoadState({ error: true, loader: module.pageLoader });
        }
      },
    );

    return () => {
      active = false;
    };
  }, [module]);

  if (!module) {
    return <MissingSettingsModule basePath={basePath} />;
  }

  const matchingLoadState =
    module.pageLoader === loadState.loader ? loadState : undefined;

  if (
    module.pageLoader &&
    !matchingLoadState?.page &&
    !matchingLoadState?.error
  ) {
    return (
      <div className='grid min-h-[55vh] place-items-center text-sm text-muted-foreground'>
        正在加载设置模块…
      </div>
    );
  }

  if (matchingLoadState?.error) {
    return (
      <section className='mx-auto mt-20 max-w-lg rounded-xl border border-border bg-card p-6 text-center'>
        <h1 className='font-semibold'>设置模块加载失败</h1>
        <p className='mt-2 text-sm text-muted-foreground'>
          {module.title} 的页面入口暂时不可用，请刷新后重试。
        </p>
      </section>
    );
  }

  if (matchingLoadState?.page) {
    return createElement(matchingLoadState.page.default, { basePath, module });
  }
  return <AppSettingsModuleOverview basePath={basePath} module={module} />;
}

interface AppSettingsModuleLoadState {
  readonly error?: boolean;
  readonly loader?: AppSettingsRegisteredModule['pageLoader'];
  readonly page?: AppSettingsModulePageModule;
}

interface MissingSettingsModuleProps {
  readonly basePath: string;
}

function MissingSettingsModule({
  basePath,
}: MissingSettingsModuleProps): ReactElement {
  return (
    <div className='grid min-h-[55vh] place-items-center'>
      <section className='w-full max-w-lg rounded-xl border border-border bg-card p-6 text-center'>
        <span className='mx-auto grid size-11 place-items-center rounded-xl bg-muted text-muted-foreground'>
          <RouteOff className='size-5' />
        </span>
        <h1 className='mt-4 font-semibold'>未找到设置模块</h1>
        <p className='mt-2 text-sm text-muted-foreground'>
          该入口尚未注册，或模块标识已经发生变化。
        </p>
        <Link
          className='mt-5 inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground'
          to={basePath}
        >
          <ArrowLeft className='size-4' /> 返回设置中心
        </Link>
      </section>
    </div>
  );
}
