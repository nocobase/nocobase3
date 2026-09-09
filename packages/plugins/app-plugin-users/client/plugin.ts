import {
  defineClientPlugin,
  type AppClientRouteComponentLoader,
  type AppClientPluginFactory,
} from '@nocobase/app-client/plugins';

import locales from './locales/index.js';
import { createUsersRoutes, USERS_ROUTE_ID } from './routes.js';
import serviceProviders from './service-provider.js';

export interface UsersClientOptions {
  readonly mount?: 'settings' | 'app';
  /** Path relative to the selected mount, for example `/users`. */
  readonly path?: string;
  readonly title?: string;
  /** Refine resource name that owns this entry when mounted in the App. */
  readonly navigationParent?: string;
  /** Optional sibling order for an App-mounted navigation entry. */
  readonly navigationOrder?: number;
  /** Replaces only the page implementation; mount and path remain owned here. */
  readonly componentLoader?: AppClientRouteComponentLoader;
}

const users: AppClientPluginFactory<UsersClientOptions> = defineClientPlugin({
  packageName: '@nocobase/app-plugin-users',
  locales,
  serviceProviders: (options) =>
    (options.mount ?? 'settings') === 'app' ? serviceProviders : [],
  routes: (options) => createUsersRoutes(options),
  routeComponentOverrides: (options) =>
    options.componentLoader
      ? [
          {
            routeId: USERS_ROUTE_ID,
            componentLoader: options.componentLoader,
          },
        ]
      : [],
});

export default users;
