import {
  defineServerPlugin,
  type AppServerPlugin,
} from '@nocobase/app-server-kit/plugins';

import serviceProviders from './providers/index.js';
import routes from './routes/index.js';

const systemInfoPlugin: AppServerPlugin = defineServerPlugin({
  packageName: '@nocobase/app-plugin-system-info',
  serviceProviders,
  routes,
});

export default systemInfoPlugin;
