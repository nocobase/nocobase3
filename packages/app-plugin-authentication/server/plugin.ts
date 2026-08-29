import {
  defineServerPlugin,
  type AppServerPlugin,
} from '@nocobase/app-server-kit/plugins';

import AuthenticationProvider from './provider.js';
import { authenticationConfig } from './config.js';
import { authenticationApiRoutes } from './routes.js';

const authenticationPlugin: AppServerPlugin = defineServerPlugin({
  packageName: '@nocobase/app-plugin-authentication',
  config: authenticationConfig,
  providers: [AuthenticationProvider],
  apiRoutes: [authenticationApiRoutes],
  database: {
    migrations: './database/migrations',
    seeds: './database/seeds',
  },
});

export default authenticationPlugin;
