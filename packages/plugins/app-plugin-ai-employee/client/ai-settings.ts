import type {
  AppClientRouteComponentLoader,
  AppClientSettingsRouteGroupDefinition,
} from '@nocobase/app-client/plugins';
import {
  Bot,
  BrainCircuit,
  ContactRound,
  Plug,
  Sparkles,
  Wrench,
} from 'lucide-react';

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
];
const contributedTabs = new Map<string, AISettingsTabDefinition>();
let cachedTabs: readonly AISettingsTabDefinition[] = coreTabs;
/** @deprecated Contribute Settings routes with parent: 'aiGroup' instead. No longer rendered by the employee page. */
export function registerAISettingsTabs(
  tabs: readonly AISettingsTabDefinition[],
): void {
  for (const tab of tabs) {
    contributedTabs.set(tab.key, tab);
  }
  cachedTabs = [...coreTabs, ...contributedTabs.values()];
}

/** @deprecated Legacy registry only; the employee shell no longer renders these tabs. */
export function getAISettingsTabs(): readonly AISettingsTabDefinition[] {
  return cachedTabs;
}

export function createAISettings(): AppClientSettingsRouteGroupDefinition {
  return {
    name: 'aiGroup',
    navigation: { title: 'AI', icon: Bot },
    children: [
      {
        name: 'ai',
        path: '/ai',
        navigation: { title: 'AI Employees', icon: ContactRound },
        authz: {
          resource: { type: 'page', id: 'ai.settings' },
          action: 'access',
        },
        componentLoader: () => import('./pages/settings-page.js'),
      },
      {
        name: 'aiSkills',
        path: '/ai/skills',
        navigation: { title: 'Skills', icon: Sparkles },
        authz: {
          resource: { type: 'page', id: 'ai.settings' },
          action: 'access',
        },
        componentLoader: () => import('./pages/skills-settings-page.js'),
      },
      {
        name: 'aiTools',
        path: '/ai/tools',
        navigation: { title: 'tools.title', icon: Wrench },
        authz: {
          resource: { type: 'page', id: 'ai.settings' },
          action: 'access',
        },
        componentLoader: () => import('./pages/tools-settings-page.js'),
      },
      {
        name: 'aiConversations',
        path: '/ai/conversations',
        authz: {
          resource: { type: 'page', id: 'ai.settings' },
          action: 'access',
        },
        componentLoader: () =>
          import('./pages/conversation-center-settings-page.js'),
      },
      {
        name: 'aiLLMServices',
        path: '/ai/llm-services',
        navigation: { title: 'LLM services', icon: BrainCircuit },
        authz: {
          resource: { type: 'page', id: 'ai.settings' },
          action: 'access',
        },
        componentLoader: () => import('./pages/llm-service-settings-page.js'),
      },
      {
        name: 'aiMCPServices',
        path: '/ai/mcp-services',
        navigation: { title: 'MCP services', icon: Plug },
        authz: {
          resource: { type: 'page', id: 'ai.settings' },
          action: 'access',
        },
        componentLoader: () => import('./pages/mcp-service-settings-page.js'),
      },
      {
        name: 'aiSettings',
        path: '/ai/settings',
        authz: {
          resource: { type: 'page', id: 'ai.settings' },
          action: 'access',
        },
        componentLoader: () => import('./pages/service-settings-page.js'),
      },
    ],
  };
}
