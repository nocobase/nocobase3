import {
  defineServerPlugin,
  type AppServerPlugin,
  type AppPluginProviderConstructor,
} from '@nocobase/app-server/plugins';

import routes from './routes/index.js';

import { WorkflowProvider, type WorkflowProviderConfig } from './provider.js';

const serviceProviders: readonly AppPluginProviderConstructor<WorkflowProviderConfig>[] =
  [WorkflowProvider];

const workflowPlugin: AppServerPlugin<WorkflowProviderConfig> =
  defineServerPlugin<WorkflowProviderConfig>({
    packageName: '@nocobase/app-plugin-workflow',
    locales: () => import('./locales/index.js'),
    serviceProviders,
    routes,
    database: {
      migrations: './database/migrations',
    },
  });

export default workflowPlugin;
