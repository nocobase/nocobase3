import {
  defineServerPlugin,
  type AppServerPlugin,
} from '@nocobase/app-server-kit/plugins';

import providers from './providers/index.js';
import routes from './routes/index.js';

const authorizationPlugin: AppServerPlugin = defineServerPlugin({
  packageName: '@nocobase/app-plugin-authorization',
  providers,
  routes,
  database: {
    migrations: './database/migrations',
    seeds: './database/seeds',
  },
});

export default authorizationPlugin;
