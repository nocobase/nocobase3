import {
  defineServerPlugin,
  type AppPluginApplication,
  type AppServerPlugin,
} from '@nocobase/app-server-kit/plugins';
import {
  defineApiRoutes,
  type AppApiRoutes,
} from '@nocobase/app-server-kit/router';

import WorkflowProvider from './provider.js';
import { workflowConfig } from './config.js';
import registerWorkflowRoutes from './routes/routes.js';

const workflowApiRoutes: AppApiRoutes<AppPluginApplication> = defineApiRoutes({
  name: '@nocobase/app-plugin-workflow/api',
  register(router, app): void {
    registerWorkflowRoutes(app, router);
  },
});

const workflowPlugin: AppServerPlugin = defineServerPlugin({
  packageName: '@nocobase/app-plugin-workflow',
  config: workflowConfig,
  providers: [WorkflowProvider],
  apiRoutes: [workflowApiRoutes],
  database: {
    migrations: './database/migrations',
  },
});

export default workflowPlugin;
