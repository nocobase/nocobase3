import {
  defineClientRoutes,
  type AppClientRouteDefinition,
} from '@nocobase/app-client/plugins';
import { withAISettingsShell } from './ai-settings-shell.js';
import {
  aiEmployeePath,
  aiSettingsPath,
  llmServicePath,
} from './route-paths.js';

const routes: readonly AppClientRouteDefinition[] = defineClientRoutes([
  {
    name: 'ai-settings-entry',
    path: aiSettingsPath,
    auth: 'required',
    componentLoader: () => import('./pages/ai-settings-shell.js'),
  },
  {
    name: 'ai-employee-management',
    path: aiEmployeePath,
    auth: 'required',
    componentLoader: async () => {
      const module = await import('./pages/ai-employee-page.js');
      return { default: withAISettingsShell(module.default) };
    },
  },
  {
    name: 'ai-llm-service-management',
    path: llmServicePath,
    auth: 'required',
    componentLoader: async () => {
      const module = await import('./pages/llm-service-page.js');
      return { default: withAISettingsShell(module.default) };
    },
  },
]);

export default routes;
