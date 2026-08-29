import {
  defineClientPlugin,
  type AppClientPluginFactory,
} from '@nocobase/app-client/plugins';

export interface WorkflowClientOptions {
  readonly placeholder?: never;
}

const workflow: AppClientPluginFactory<WorkflowClientOptions> =
  defineClientPlugin({
    packageName: '@nocobase/app-plugin-workflow',
    bootstrap: () => import('./bootstrap.js'),
    locales: () => import('./locales/index.js'),
    routes: () => import('./routes.js'),
  });

export default workflow;
