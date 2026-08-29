import {
  defineServerPlugin,
  type AppPluginApplication,
  type AppServerPlugin,
} from '@nocobase/app-server-kit/plugins';
import {
  defineApiRoutes,
  type AppApiRoutes,
} from '@nocobase/app-server-kit/router';

import WorkflowProvider, { type WorkflowProviderConfig } from './provider.js';
import registerWorkflowRoutes from './routes/routes.js';

const workflowApiRoutes: AppApiRoutes<
  AppPluginApplication<WorkflowProviderConfig>
> = defineApiRoutes({
  name: '@nocobase/app-plugin-workflow/api',
  register(router, app): void {
    registerWorkflowRoutes(app, router);
  },
});

const workflowPlugin: AppServerPlugin<WorkflowProviderConfig> =
  defineServerPlugin({
    packageName: '@nocobase/app-plugin-workflow',
    providers: [WorkflowProvider],
    apiRoutes: [workflowApiRoutes],
    database: {
      migrations: './database/migrations',
    },
  });

export default workflowPlugin;
