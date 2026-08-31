import {
  defineClientPlugin,
  type AppClientPluginFactory,
} from '@nocobase/app-client/plugins';

import reactWrappers from './react-wrappers.js';
import routes from './routes.js';

export interface InstallClientOptions {
  readonly placeholder?: never;
}

const install: AppClientPluginFactory<InstallClientOptions> =
  defineClientPlugin({
    packageName: '@nocobase/app-plugin-install',
    routes,
    reactWrappers,
  });

export default install;
