import {
  defineClientModule,
  type AppClientModuleFactory,
  type AppClientRouteComponentLoader,
} from '@nocobase/app-client/plugins';

import { AUTHENTICATION_ROUTE_IDS } from './route-contracts.js';

export interface AuthenticationClientOptions {
  readonly loginPage?: AppClientRouteComponentLoader;
  readonly registerPage?: AppClientRouteComponentLoader;
}

const authentication: AppClientModuleFactory<AuthenticationClientOptions> =
  defineClientModule({
    packageName: '@nocobase/app-plugin-authentication',
    bootstrap: () => import('./bootstrap.js'),
    routes: () => import('./routes.js'),
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
