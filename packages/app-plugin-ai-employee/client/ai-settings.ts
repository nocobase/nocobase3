import type {
  AppClientRouteComponentLoader,
  AppClientSettingsRoutePageDefinition,
} from '@nocobase/app-client/plugins';
import { Bot } from 'lucide-react';

export interface AISettingsTabDefinition {
  readonly key: string;
  readonly labelKey: string;
  readonly pageLoader: AppClientRouteComponentLoader;
}

const coreTabs: readonly AISettingsTabDefinition[] = [
  {
    key: 'ai-employee',
    labelKey: 'AI Employee',
    pageLoader: () => import('./pages/ai-employee-page.js'),
  },
  {
    key: 'llm-service',
    labelKey: 'LLM Service',
    pageLoader: () => import('./pages/llm-service-page.js'),
  },
];
const contributedTabs = new Map<string, AISettingsTabDefinition>();
let cachedTabs: readonly AISettingsTabDefinition[] = coreTabs;
export function registerAISettingsTabs(
  tabs: readonly AISettingsTabDefinition[],
): void {
  for (const tab of tabs) {
    contributedTabs.set(tab.key, tab);
  }
  cachedTabs = [...coreTabs, ...contributedTabs.values()];
}

export function getAISettingsTabs(): readonly AISettingsTabDefinition[] {
  return cachedTabs;
}

export function createAISettings(): AppClientSettingsRoutePageDefinition {
  return {
    name: 'ai',
    path: '/ai',
    navigation: { title: 'AI Employee', icon: Bot },
    access: { resource: 'ai.settings', action: 'read' },
    componentLoader: () => import('./pages/settings-page.js'),
  };
}
