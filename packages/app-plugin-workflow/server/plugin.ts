import {
  defineServerPlugin,
  type AppServerPlugin,
} from '@nocobase/app-server-kit/plugins';

import providers from './providers/index.js';
import type { WorkflowProviderConfig } from './providers/workflow.js';
import routes from './routes/index.js';

const workflowPlugin: AppServerPlugin<WorkflowProviderConfig> =
  defineServerPlugin({
    packageName: '@nocobase/app-plugin-workflow',
    providers,
    routes,
    database: {
      migrations: './database/migrations',
    },
  });

export default workflowPlugin;
