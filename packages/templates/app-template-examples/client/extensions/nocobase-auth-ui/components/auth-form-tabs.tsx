import { useState, type ReactElement, type ReactNode } from 'react';

export interface AuthFormTab {
  readonly content: ReactNode;
  readonly id: string;
  readonly label: ReactNode;
}

export interface AuthFormTabsProps {
  readonly tabs: readonly AuthFormTab[];
}

export function AuthFormTabs({ tabs }: AuthFormTabsProps): ReactElement | null {
  const [activeId, setActiveId] = useState(tabs[0]?.id);
  const activeTab = tabs.find((tab) => tab.id === activeId) ?? tabs[0];

  if (!activeTab) return null;

  return (
    <div className='space-y-6'>
      <div
        aria-label='Authentication methods'
        className='grid grid-flow-col auto-cols-fr rounded-lg bg-muted p-1'
        role='tablist'
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab.id;
          return (
            <button
              aria-controls={`auth-form-tabpanel-${tab.id}`}
              aria-selected={isActive}
              className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              id={`auth-form-tab-${tab.id}`}
              key={tab.id}
              onClick={() => setActiveId(tab.id)}
              role='tab'
              type='button'
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      <div
        aria-labelledby={`auth-form-tab-${activeTab.id}`}
        id={`auth-form-tabpanel-${activeTab.id}`}
        role='tabpanel'
      >
        {activeTab.content}
      </div>
    </div>
  );
}
