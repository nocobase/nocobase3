import type { ComponentType, ReactElement, ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { getAISettingsTabs } from './ai-settings.js';
import { useT } from './locales/index.js';
import {
  aiSettingsPath,
  knowledgeBaseRoutePath,
  vectorDatabaseRoutePath,
} from './route-paths.js';

export interface AISettingsShellProps {
  readonly activeTabKey?: string;
  readonly children: ReactNode;
  readonly onTabChange?: (tabKey: string) => void;
}

export function getActiveAISettingsTabKey(
  pathname: string,
  search = '',
): string {
  if (pathname.startsWith(`${knowledgeBaseRoutePath}/`)) {
    return 'knowledge-base';
  }
  if (pathname.startsWith(`${vectorDatabaseRoutePath}/`)) {
    return 'vector-database';
  }
  if (pathname === aiSettingsPath) {
    return new URLSearchParams(search).get('tab') ?? 'ai-employee';
  }
  return 'ai-employee';
}

export function AISettingsShell({
  activeTabKey,
  children,
  onTabChange,
}: AISettingsShellProps): ReactElement {
  const t = useT();
  const location = useLocation();
  const navigate = useNavigate();
  const resolvedActiveTabKey =
    activeTabKey ??
    getActiveAISettingsTabKey(location.pathname, location.search);

  return (
    <div className='min-h-full bg-muted/20 text-foreground'>
      <header className='border-b bg-background px-6 py-7'>
        <div className='mx-auto w-full max-w-7xl'>
          <h1 className='text-2xl font-semibold tracking-tight'>
            {t('AI Employee')}
          </h1>
          <p className='mt-2 max-w-3xl text-sm text-muted-foreground'>
            {t('Manage AI employees, LLM services, and MCP services.')}
          </p>
        </div>
      </header>
      <div className='mx-auto w-full max-w-7xl px-6 py-6'>
        <nav
          aria-label={t('AI settings')}
          className='mb-6 flex gap-1 overflow-x-auto border-b'
        >
          {getAISettingsTabs().map((tab) => {
            const active = resolvedActiveTabKey === tab.key;
            return (
              <button
                key={tab.key}
                type='button'
                aria-current={active ? 'page' : undefined}
                className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors ${active ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
                onClick={() => {
                  if (active) return;
                  if (onTabChange) {
                    onTabChange(tab.key);
                    return;
                  }
                  void navigate(aiSettingsPath, {
                    state: { aiSettingsTab: tab.key },
                  });
                }}
              >
                {t(tab.labelKey)}
              </button>
            );
          })}
        </nav>
        {children}
      </div>
    </div>
  );
}

export function withAISettingsShell(Page: ComponentType): ComponentType {
  function AISettingsRoute(): ReactElement {
    return (
      <AISettingsShell>
        <Page />
      </AISettingsShell>
    );
  }
  AISettingsRoute.displayName = `withAISettingsShell(${Page.displayName ?? Page.name ?? 'Page'})`;
  return AISettingsRoute;
}
