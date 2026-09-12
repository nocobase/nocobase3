import {
  defineServerPlugin,
  type AppServerPlugin,
} from '@nocobase/app-server/plugins';

import serviceProviders from './provider/index.js';
import routes from './route/plugin.js';
export { aiManagerToken } from './provider/ai-employee.js';

const aiEmployeePlugin: AppServerPlugin = defineServerPlugin({
  packageName: '@nocobase/app-plugin-ai-employee',
  serviceProviders,
  routes,
  database: {
    migrations: './database/migrations',
  },
});

export default aiEmployeePlugin;
