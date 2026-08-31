import {
  defineServerPlugin,
  type AppServerPlugin,
} from '@nocobase/app-server/plugins';

import serviceProviders from './providers/index.js';
import routes from './routes/plugin.js';

const aiEmployeePlugin: AppServerPlugin = defineServerPlugin({
  packageName: '@nocobase/app-plugin-ai-employee',
  serviceProviders,
  routes,
  database: {
    migrations: './database/migrations',
  },
});

export default aiEmployeePlugin;
