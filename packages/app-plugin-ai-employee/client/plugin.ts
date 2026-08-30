import {
  defineClientPlugin,
  type AppClientPluginFactory,
} from '@nocobase/app-client/plugins';

export interface AIEmployeeClientOptions {
  readonly placeholder?: never;
}

const aiEmployee: AppClientPluginFactory<AIEmployeeClientOptions> =
  defineClientPlugin({
    packageName: '@nocobase/app-plugin-ai-employee',
    bootstrap: () => import('./bootstrap.js'),
    settings: () => import('./settings.js'),
  });

export default aiEmployee;
