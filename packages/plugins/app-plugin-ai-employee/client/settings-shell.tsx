import type { ReactElement, ReactNode } from 'react';
import type { AISettingsTabDefinition } from './ai-settings.js';
import { PageContainer } from './components/page-container.js';
import { PageHeader } from './components/page-header.js';
import { useT } from './locales/index.js';

type SettingsShellProps = {
  readonly title: string;
  readonly description: string;
  readonly children: ReactNode;
} & (
  | {
      readonly navigationLabel: string;
      readonly tabs: readonly AISettingsTabDefinition[];
      readonly activeTabKey: string;
      readonly onTabChange: (tabKey: string) => void;
    }
  | {
      readonly navigationLabel?: never;
      readonly tabs?: never;
      readonly activeTabKey?: never;
      readonly onTabChange?: never;
    }
);

export function SettingsShell({
  title,
  description,
  navigationLabel,
  tabs,
  activeTabKey,
  onTabChange,
  children,
}: SettingsShellProps): ReactElement {
  const t = useT();
  return (
    <PageContainer>
      <PageHeader title={t(title)} description={t(description)} />
      {tabs && tabs.length > 1 ? (
        <nav
          aria-label={t(navigationLabel)}
          className='flex gap-1 overflow-x-auto border-b'
        >
          {tabs.map((tab) => {
            const active = activeTabKey === tab.key;
            return (
              <button
                key={tab.key}
                type='button'
                aria-current={active ? 'page' : undefined}
                className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors ${active ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
                onClick={() => {
                  if (!active) onTabChange(tab.key);
                }}
              >
                {t(tab.labelKey)}
              </button>
            );
          })}
        </nav>
      ) : null}
      <div>{children}</div>
    </PageContainer>
  );
}
