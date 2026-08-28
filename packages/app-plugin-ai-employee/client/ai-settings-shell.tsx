import type { ComponentType, ReactElement, ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';
import {
  aiEmployeePath,
  knowledgeBasePath,
  llmServicePath,
  vectorDatabasesPath,
} from './route-paths.js';

export interface AISettingsTab {
  label: string;
  path: string;
  active: (pathname: string) => boolean;
}

export const aiSettingsTabs: readonly AISettingsTab[] = [
  {
    label: 'AI 员工',
    path: aiEmployeePath,
    active: (pathname) => pathname === aiEmployeePath,
  },
  {
    label: 'LLM 服务',
    path: llmServicePath,
    active: (pathname) => pathname === llmServicePath,
  },
  {
    label: '知识库',
    path: knowledgeBasePath,
    active: (pathname) =>
      pathname === knowledgeBasePath ||
      pathname.startsWith(`${knowledgeBasePath}/`),
  },
  {
    label: '向量数据库',
    path: vectorDatabasesPath,
    active: (pathname) =>
      pathname === vectorDatabasesPath ||
      pathname.startsWith(`${vectorDatabasesPath}/`),
  },
];

export function getActiveAISettingsPath(pathname: string): string | undefined {
  return aiSettingsTabs.find((tab) => tab.active(pathname))?.path;
}

export interface AISettingsShellProps {
  children: ReactNode;
}

export function AISettingsShell({
  children,
}: AISettingsShellProps): ReactElement {
  const location = useLocation();
  const navigate = useNavigate();
  const activePath = getActiveAISettingsPath(location.pathname);
  return (
    <div className='min-h-full bg-background text-foreground'>
      <header className='border-b bg-background px-4 pt-5 sm:px-6 lg:px-8'>
        <h1 className='text-2xl font-semibold tracking-tight'>AI Employee</h1>
        <nav
          aria-label='AI settings'
          className='mt-4 flex gap-1 overflow-x-auto'
        >
          {aiSettingsTabs.map((tab) => {
            const active = activePath === tab.path;
            return (
              <button
                key={tab.path}
                type='button'
                aria-current={active ? 'page' : undefined}
                className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors ${active ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
                onClick={() => {
                  if (!active) void navigate(tab.path);
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>
      </header>
      {children}
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
