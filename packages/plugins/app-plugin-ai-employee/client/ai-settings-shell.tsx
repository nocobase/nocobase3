import type { ComponentType, ReactElement, ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { getAISettingsTabs } from './ai-settings.js';
import { SettingsShell } from './settings-shell.js';
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
  search: string = '',
  state: unknown = undefined,
): string {
  const normalizedPath = pathname.replace(/\/+$/, '');
  if (pathname.startsWith(`${knowledgeBaseRoutePath}/`)) {
    return 'knowledge-base';
  }
  if (pathname.startsWith(`${vectorDatabaseRoutePath}/`)) {
    return 'vector-database';
  }
  if (normalizedPath === aiSettingsPath) {
    const stateTab =
      state !== null &&
      typeof state === 'object' &&
      'aiSettingsTab' in state &&
      typeof state.aiSettingsTab === 'string'
        ? state.aiSettingsTab
        : undefined;
    return new URLSearchParams(search).get('tab') ?? stateTab ?? 'ai-employee';
  }
  return 'ai-employee';
}

export function AISettingsShell({
  activeTabKey,
  children,
  onTabChange,
}: AISettingsShellProps): ReactElement {
  const location = useLocation();
  const navigate = useNavigate();
  const resolvedActiveTabKey =
    activeTabKey ??
    getActiveAISettingsTabKey(
      location.pathname,
      location.search,
      location.state,
    );

  return (
    <SettingsShell
      title='AI Employees'
      description='employees.pageDescription'
      navigationLabel='AI settings'
      tabs={getAISettingsTabs()}
      activeTabKey={resolvedActiveTabKey}
      onTabChange={(tabKey) => {
        if (onTabChange) {
          onTabChange(tabKey);
          return;
        }
        const search = new URLSearchParams(location.search);
        search.set('tab', tabKey);
        void navigate({
          pathname: aiSettingsPath,
          search: search.toString(),
          hash: location.hash,
        });
      }}
    >
      {children}
    </SettingsShell>
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
