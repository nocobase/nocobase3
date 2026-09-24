import {
  defineDevRoutes,
  defineSettingsRoutes,
  type AppClientRouteComponentLoader,
  type AppClientRouteContribution,
} from '@nocobase/app-client/plugins';
import { Bot } from 'lucide-react';

import { createAISettings } from './ai-settings.js';

function createAIEmployeeDemoLoader(
  exportName:
    | 'AIChatDemoPage'
    | 'FloatingChatDemoPage'
    | 'AIEmployeeTasksDemoPage'
    | 'PageContextDemoPage'
    | 'ToolCardsDemoPage',
): AppClientRouteComponentLoader {
  return async () => {
    const pages = await import('./dev/demo-pages.js');
    return { default: pages[exportName] };
  };
}

const routes: readonly AppClientRouteContribution[] = [
  defineSettingsRoutes([createAISettings()]),
  defineDevRoutes([
    {
      name: 'ai-components',
      path: '/ai-components',
      navigation: { title: 'demo.navigation.group', icon: Bot },
      breadcrumb: { title: 'demo.navigation.group' },
      children: [
        {
          name: 'ai-chat-window',
          path: '/chat',
          navigation: { title: 'demo.navigation.chat' },
          breadcrumb: { title: 'demo.navigation.chat' },
          componentLoader: createAIEmployeeDemoLoader('AIChatDemoPage'),
        },
        {
          name: 'ai-floating-chat',
          path: '/floating',
          navigation: { title: 'demo.navigation.floating' },
          breadcrumb: { title: 'demo.navigation.floating' },
          componentLoader: createAIEmployeeDemoLoader('FloatingChatDemoPage'),
        },
        {
          name: 'ai-employee-tasks',
          path: '/tasks',
          navigation: { title: 'demo.navigation.tasks' },
          breadcrumb: { title: 'demo.navigation.tasks' },
          componentLoader: createAIEmployeeDemoLoader(
            'AIEmployeeTasksDemoPage',
          ),
        },
        {
          name: 'ai-page-context',
          path: '/context',
          navigation: { title: 'demo.navigation.context' },
          breadcrumb: { title: 'demo.navigation.context' },
          componentLoader: createAIEmployeeDemoLoader('PageContextDemoPage'),
        },
        {
          name: 'ai-tool-cards',
          path: '/tools',
          navigation: { title: 'demo.navigation.tools' },
          breadcrumb: { title: 'demo.navigation.tools' },
          componentLoader: createAIEmployeeDemoLoader('ToolCardsDemoPage'),
        },
      ],
    },
  ]),
];

export default routes;
