import {
  defineDevRoutes,
  defineSettingsRoutes,
  type AppClientRouteComponentLoader,
  type AppClientRouteContribution,
} from '@nocobase/app-client/plugins';
import { Bot } from 'lucide-react';

import { createAISettings } from './ai-settings.js';

interface ImportMetaWithBundlerEnv {
  readonly env?: { readonly PROD?: boolean };
}

function createAIEmployeeDemoLoader(
  exportName:
    | 'AIChatDemoPage'
    | 'FloatingChatDemoPage'
    | 'AIEmployeeTasksDemoPage'
    | 'PageContextDemoPage'
    | 'ToolCardsDemoPage',
): AppClientRouteComponentLoader {
  return async () => {
    if ((import.meta as ImportMetaWithBundlerEnv).env?.PROD) {
      throw new Error('AI Employee Dev Routes are unavailable in production.');
    }
    const pages =
      await import('@nocobase/app-plugin-ai-employee/registry/nocobase-ai/demo-pages');
    return { default: pages[exportName] };
  };
}

const routes: readonly AppClientRouteContribution[] = [
  defineSettingsRoutes([createAISettings()]),
  defineDevRoutes([
    {
      name: 'ai-components',
      path: '/ai-components',
      navigation: { title: 'AI Components', icon: Bot },
      children: [
        {
          name: 'ai-chat-window',
          path: '/chat',
          navigation: { title: 'Chat window' },
          componentLoader: createAIEmployeeDemoLoader('AIChatDemoPage'),
        },
        {
          name: 'ai-floating-chat',
          path: '/floating',
          navigation: { title: 'Floating chat' },
          componentLoader: createAIEmployeeDemoLoader('FloatingChatDemoPage'),
        },
        {
          name: 'ai-employee-tasks',
          path: '/tasks',
          navigation: { title: 'Employee tasks' },
          componentLoader: createAIEmployeeDemoLoader(
            'AIEmployeeTasksDemoPage',
          ),
        },
        {
          name: 'ai-page-context',
          path: '/context',
          navigation: { title: 'Page context' },
          componentLoader: createAIEmployeeDemoLoader('PageContextDemoPage'),
        },
        {
          name: 'ai-tool-cards',
          path: '/tools',
          navigation: { title: 'Tool cards' },
          componentLoader: createAIEmployeeDemoLoader('ToolCardsDemoPage'),
        },
      ],
    },
  ]),
];

export default routes;
