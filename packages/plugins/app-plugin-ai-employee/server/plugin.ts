import {
  defineServerPlugin,
  type AppServerPlugin,
} from '@nocobase/app-server/plugins';

import { aiConfig } from './config.js';
import serviceProviders from './provider/index.js';
import routes from './route/plugin.js';

const aiEmployeePlugin: AppServerPlugin = defineServerPlugin({
  packageName: '@nocobase/app-plugin-ai-employee',
  config: aiConfig,
  serviceProviders,
  routes,
  database: {
    migrations: './database/migrations',
  },
});

export default aiEmployeePlugin;
