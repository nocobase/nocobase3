import {
  defineServerPlugin,
  type AppPluginApplication,
  type AppServerPlugin,
} from '@nocobase/app-server-kit/plugins';
import {
  defineApiRoutes,
  type AppApiRoutes,
} from '@nocobase/app-server-kit/router';

import AuthorizationProvider from './provider.js';
import registerAuthorizationRoutes from './routes/index.js';

const authorizationApiRoutes: AppApiRoutes<AppPluginApplication> =
  defineApiRoutes({
    name: '@nocobase/app-plugin-authorization/api',
    register(router, app): void {
      registerAuthorizationRoutes(app, router);
    },
  });

const authorizationPlugin: AppServerPlugin = defineServerPlugin({
  packageName: '@nocobase/app-plugin-authorization',
  providers: [AuthorizationProvider],
  apiRoutes: [authorizationApiRoutes],
  database: {
    migrations: './database/migrations',
    seeds: './database/seeds',
  },
});

export default authorizationPlugin;
