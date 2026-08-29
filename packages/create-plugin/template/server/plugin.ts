import {
  defineServerPlugin,
  type AppServerPlugin,
} from '@nocobase/app-server-kit/plugins';

import providers from './providers/index.js';
import routes from './routes/index.js';

const __NOCOBASE_MODULE_NAME__Plugin: AppServerPlugin = defineServerPlugin({
  packageName: __NOCOBASE_PACKAGE_NAME_LITERAL__,
  providers,
  routes,
});

export default __NOCOBASE_MODULE_NAME__Plugin;
