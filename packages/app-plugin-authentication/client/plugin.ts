import {
  defineClientPlugin,
  type AppClientPluginFactory,
  type AppClientRouteComponentLoader,
} from '@nocobase/app-client/plugins';

import { AUTHENTICATION_ROUTE_IDS } from './route-contracts.js';
import routes from './routes.js';
import serviceProviders from './service-provider.js';

export interface AuthenticationClientOptions {
  readonly loginPage?: AppClientRouteComponentLoader;
  readonly registerPage?: AppClientRouteComponentLoader;
}

const authentication: AppClientPluginFactory<AuthenticationClientOptions> =
  defineClientPlugin({
    packageName: '@nocobase/app-plugin-authentication',
    serviceProviders,
    routes,
    routeComponentOverrides: (options) => [
      ...(options.loginPage
        ? [
            {
              routeId: AUTHENTICATION_ROUTE_IDS.login,
              componentLoader: options.loginPage,
            },
          ]
        : []),
      ...(options.registerPage
        ? [
            {
              routeId: AUTHENTICATION_ROUTE_IDS.register,
              componentLoader: options.registerPage,
            },
          ]
        : []),
    ],
  });

export default authentication;
