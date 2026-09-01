import {
  defineClientPlugin,
  type AppClientPluginFactory,
} from '@nocobase/app-client/plugins';

import reactProviders from './react-providers.js';
import routes from './routes.js';
import serviceProviders from './service-provider.js';

export interface AuthorizationClientOptions {
  readonly placeholder?: never;
}

const authorization: AppClientPluginFactory<AuthorizationClientOptions> =
  defineClientPlugin({
    packageName: '@nocobase/app-plugin-authorization',
    serviceProviders,
    routes,
    reactProviders,
  });

export default authorization;
