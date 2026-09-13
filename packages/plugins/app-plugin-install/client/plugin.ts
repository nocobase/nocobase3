import {
  defineClientPlugin,
  type AppClientPluginFactory,
} from '@nocobase/app-client/plugins';

import locales from './locales/index.js';
import reactProviders from './react-providers.js';
import routes from './routes.js';

export interface InstallClientOptions {
  readonly placeholder?: never;
}

const install: AppClientPluginFactory<InstallClientOptions> =
  defineClientPlugin({
    packageName: '@nocobase/app-plugin-install',
    locales,
    routes,
    reactProviders,
  });

export default install;
