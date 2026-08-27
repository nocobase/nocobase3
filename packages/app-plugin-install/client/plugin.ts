import {
  defineClientPlugin,
  type AppClientPluginFactory,
} from '@nocobase/app-client/plugins';

export interface InstallClientOptions {
  readonly placeholder?: never;
}

const install: AppClientPluginFactory<InstallClientOptions> =
  defineClientPlugin({
    packageName: '@nocobase/app-plugin-install',
    routes: () => import('./routes.js'),
    providers: () => import('./providers.js'),
  });

export default install;
