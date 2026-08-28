import {
  defineClientPlugin,
  type AppClientPluginFactory,
} from '@nocobase/app-client/plugins';

export interface AuthorizationClientOptions {
  readonly placeholder?: never;
}

const authorization: AppClientPluginFactory<AuthorizationClientOptions> =
  defineClientPlugin({
    packageName: '@nocobase/app-plugin-authorization',
    bootstrap: () => import('./bootstrap.js'),
    routes: () => import('./routes.js'),
    providers: () => import('./providers.js'),
  });

export default authorization;
