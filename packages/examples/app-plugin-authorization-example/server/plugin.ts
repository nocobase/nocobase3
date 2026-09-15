import {
  defineServerPlugin,
  type AppServerPlugin,
} from '@nocobase/app-server/plugins';

import serviceProviders from './providers/index.js';
import routes from './routes/index.js';

const authorizationExamplePlugin: AppServerPlugin = defineServerPlugin({
  packageName: '@nocobase/app-plugin-authorization-example',
  serviceProviders,
  routes,
  database: {
    migrations: './database/migrations',
    seeds: './database/seeds',
  },
});

export default authorizationExamplePlugin;
