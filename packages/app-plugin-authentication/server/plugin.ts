import {
  defineServerPlugin,
  type AppServerPlugin,
} from '@nocobase/app-server-kit/plugins';

import serviceProviders from './providers/index.js';
import routes from './routes/index.js';
import { authenticationConfig } from './config.js';
import type { AuthenticationProviderConfig } from './providers/authentication.js';

const authenticationPlugin: AppServerPlugin<AuthenticationProviderConfig> =
  defineServerPlugin<AuthenticationProviderConfig>({
    packageName: '@nocobase/app-plugin-authentication',
    config: authenticationConfig,
    serviceProviders,
    routes,
    database: {
      migrations: './database/migrations',
      seeds: './database/seeds',
    },
  });

export default authenticationPlugin;
