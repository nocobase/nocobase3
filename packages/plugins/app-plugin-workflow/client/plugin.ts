import {
  defineClientPlugin,
  type AppClientPluginFactory,
} from '@nocobase/app-client/plugins';

import locales from './locales/index.js';
import routes from './routes.js';
import serviceProviders from './service-provider.js';

export interface WorkflowClientOptions {
  readonly placeholder?: never;
}

const workflow: AppClientPluginFactory<WorkflowClientOptions> =
  defineClientPlugin({
    packageName: '@nocobase/app-plugin-workflow',
    serviceProviders,
    locales,
    routes,
  });

export default workflow;
