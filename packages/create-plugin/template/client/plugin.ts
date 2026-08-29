import {
  defineClientPlugin,
  type AppClientPluginFactory,
} from '@nocobase/app-client/plugins';

export interface __NOCOBASE_SYMBOL_NAME__ClientOptions {
  /** Label used for the resource registered by the bootstrap entry. */
  readonly resourceLabel?: string;
}

const __NOCOBASE_MODULE_NAME__: AppClientPluginFactory<__NOCOBASE_SYMBOL_NAME__ClientOptions> =
  defineClientPlugin({
    packageName: __NOCOBASE_PACKAGE_NAME_LITERAL__,
    bootstrap: () => import('./bootstrap.js'),
    routes: () => import('./routes.js'),
    providers: () => import('./providers.js'),
  });

export default __NOCOBASE_MODULE_NAME__;
