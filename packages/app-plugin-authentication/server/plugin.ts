import {
  defineServerPlugin,
  type AppServerPlugin,
} from '@nocobase/app-server-kit/plugins';

import AuthenticationProvider, {
  type AuthenticationProviderConfig,
} from './provider.js';
import { authenticationApiRoutes } from './routes.js';

const authenticationPlugin: AppServerPlugin<AuthenticationProviderConfig> =
  defineServerPlugin({
    packageName: '@nocobase/app-plugin-authentication',
    providers: [AuthenticationProvider],
    apiRoutes: [authenticationApiRoutes],
    database: {
      migrations: './database/migrations',
      seeds: './database/seeds',
    },
  });

export default authenticationPlugin;
