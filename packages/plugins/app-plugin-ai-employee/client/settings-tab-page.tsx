import {
  createElement,
  useEffect,
  useState,
  type ComponentType,
  type ReactElement,
} from 'react';
import type { AISettingsTabDefinition } from './ai-settings.js';
import { useT } from './locales/index.js';

export function SettingsTabPage({
  tab,
}: {
  readonly tab: AISettingsTabDefinition;
}): ReactElement {
  const t = useT();
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
    <main className='p-8 text-sm text-muted-foreground'>{t('Loading…')}</main>
  );
}
