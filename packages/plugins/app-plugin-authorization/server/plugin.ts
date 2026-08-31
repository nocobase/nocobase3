import {
  defineServerPlugin,
  type AppServerPlugin,
} from '@nocobase/app-server-kit/plugins';

import serviceProviders from './providers/index.js';
import routes from './routes/index.js';

const authorizationPlugin: AppServerPlugin = defineServerPlugin({
  packageName: '@nocobase/app-plugin-authorization',
  serviceProviders,
  routes,
  database: {
    migrations: './database/migrations',
    seeds: './database/seeds',
  },
});

export default authorizationPlugin;
