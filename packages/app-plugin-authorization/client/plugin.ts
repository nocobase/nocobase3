import {
  defineClientPlugin,
  type AppClientPluginFactory,
} from '@nocobase/app-client/plugins';

import reactWrappers from './react-wrappers.js';
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
    reactWrappers,
  });

export default authorization;
