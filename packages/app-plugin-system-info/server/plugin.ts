import {
  defineServerPlugin,
  type AppServerPlugin,
} from '@nocobase/app-server-kit/plugins';

import providers from './providers/index.js';
import routes from './routes/index.js';

const systemInfoPlugin: AppServerPlugin = defineServerPlugin({
  packageName: '@nocobase/app-plugin-system-info',
  providers,
  routes,
});

export default systemInfoPlugin;
