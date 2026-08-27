import {
  defineClientRoutes,
  type AppClientRouteDefinition,
} from '@nocobase/app-client/plugins';
import {
  withAISettingsShell,
  aiEmployeePath,
  aiSettingsPath,
} from '@nocobase/app-plugin-ai-knowledge-base/client';

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
]);

export default routes;
