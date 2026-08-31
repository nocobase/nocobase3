import {
  defineServerPlugin,
  type AppServerPlugin,
} from '@nocobase/app-server-kit/plugins';

import providers from './providers/index.js';
import routes from './routes/index.js';
import { workflowConfig } from './config.js';
import type { WorkflowProviderConfig } from './providers/workflow.js';

const workflowPlugin: AppServerPlugin<WorkflowProviderConfig> =
  defineServerPlugin<WorkflowProviderConfig>({
    packageName: '@nocobase/app-plugin-workflow',
    config: workflowConfig,
    serviceProviders: providers,
    routes,
    database: {
      migrations: './database/migrations',
    },
  });

export default workflowPlugin;
