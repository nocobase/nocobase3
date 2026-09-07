import {
  defineServerPlugin,
  type AppServerPlugin,
} from '@nocobase/app-server/plugins';

import serviceProviders from './providers/index.js';
import routes from './routes/index.js';
import { hubConfig } from './config.js';

const hubPlugin: AppServerPlugin = defineServerPlugin({
  packageName: '@nocobase/app-plugin-hub',
  config: hubConfig,
  locales: () => import('./locales/index.js'),
  serviceProviders,
  routes,
  database: {
    migrations: './database/migrations',
  },
});

export default hubPlugin;
