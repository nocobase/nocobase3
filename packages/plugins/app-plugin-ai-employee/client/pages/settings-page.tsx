import {
  createElement,
  useEffect,
  useState,
  type ComponentType,
  type ReactElement,
} from 'react';
import { AISettingsShell } from '../ai-settings-shell.js';
import {
  getAISettingsTabs,
  type AISettingsTabDefinition,
} from '../ai-settings.js';

function AISettingsTabPage({
  tab,
}: {
  readonly tab: AISettingsTabDefinition;
}): ReactElement {
  const [Page, setPage] = useState<ComponentType>();

  useEffect(() => {
    let active = true;
    setPage(undefined);
    void tab.pageLoader().then((module) => {
      if (active) setPage(() => module.default);
    });
    return () => {
      active = false;
    };
  }, [tab]);

  return Page ? (
    createElement(Page)
  ) : (
    <main className='p-8 text-sm text-muted-foreground'>Loading…</main>
  );
}

export default function AISettingsPage(): ReactElement {
  const tabs = getAISettingsTabs();
  const [activeTabKey, setActiveTabKey] = useState('ai-employee');
  const activeTab = tabs.find((tab) => tab.key === activeTabKey) ?? tabs[0];

  return (
    <AISettingsShell activeTabKey={activeTab.key} onTabChange={setActiveTabKey}>
      <AISettingsTabPage key={activeTab.key} tab={activeTab} />
    </AISettingsShell>
  );
}
