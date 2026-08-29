import {
  defineServerPlugin,
  type AppServerPlugin,
} from '@nocobase/app-server-kit/plugins';

import __NOCOBASE_SYMBOL_NAME__Provider from './provider.js';
import __NOCOBASE_MODULE_NAME__ApiRoutes from './routes.js';

const __NOCOBASE_MODULE_NAME__Plugin: AppServerPlugin = defineServerPlugin({
  packageName: __NOCOBASE_PACKAGE_NAME_LITERAL__,
  providers: [__NOCOBASE_SYMBOL_NAME__Provider],
  apiRoutes: [__NOCOBASE_MODULE_NAME__ApiRoutes],
});

export default __NOCOBASE_MODULE_NAME__Plugin;
