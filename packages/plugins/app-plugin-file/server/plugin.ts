import {
  defineServerPlugin,
  type AppServerPlugin,
} from '@nocobase/app-server/plugins';

import { inventoryApiRoutes } from './routes/inventory.js';

const filePlugin: AppServerPlugin = defineServerPlugin({
  packageName: '@nocobase/app-plugin-file',
  locales: () => import('./locales/index.js'),
  routes: [inventoryApiRoutes],
});

export default filePlugin;
