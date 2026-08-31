import {
  defineServerPlugin,
  type AppServerPlugin,
} from '@nocobase/app-server-kit/plugins';

import serviceProviders from './providers/index.js';
import routes from './routes/index.js';

const __NOCOBASE_MODULE_NAME__Plugin: AppServerPlugin = defineServerPlugin({
  packageName: __NOCOBASE_PACKAGE_NAME_LITERAL__,
  serviceProviders,
  routes,
  database: {
    migrations: './database/migrations',
    seeds: './database/seeds',
  },
  queue: {
    jobs: ['./server/jobs'],
  },
});

export default __NOCOBASE_MODULE_NAME__Plugin;
