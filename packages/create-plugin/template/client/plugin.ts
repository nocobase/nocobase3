import {
  defineClientPlugin,
  type AppClientPluginFactory,
} from '@nocobase/app-client/plugins';

import locales from './locales/index.js';
import serviceProviders from './providers/index.js';
import reactWrappers from './react-wrappers/index.js';
import routes from './routes.js';

export interface __NOCOBASE_SYMBOL_NAME__ClientOptions {
  /** Label used for the resource registered by the Client ServiceProvider. */
  readonly resourceLabel?: string;
}

const __NOCOBASE_MODULE_NAME__: AppClientPluginFactory<__NOCOBASE_SYMBOL_NAME__ClientOptions> =
  defineClientPlugin({
    packageName: __NOCOBASE_PACKAGE_NAME_LITERAL__,
    locales,
    serviceProviders,
    reactWrappers,
    routes,
  });

export default __NOCOBASE_MODULE_NAME__;
