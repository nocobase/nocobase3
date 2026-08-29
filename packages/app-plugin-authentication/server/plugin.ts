import {
  defineServerPlugin,
  type AppServerPlugin,
} from '@nocobase/app-server-kit/plugins';

import type { AuthenticationProviderConfig } from './providers/authentication.js';
import providers from './providers/index.js';
import routes from './routes/index.js';

const authenticationPlugin: AppServerPlugin<AuthenticationProviderConfig> =
  defineServerPlugin({
    packageName: '@nocobase/app-plugin-authentication',
    providers,
    routes,
    database: {
      migrations: './database/migrations',
      seeds: './database/seeds',
    },
  });

export default authenticationPlugin;
