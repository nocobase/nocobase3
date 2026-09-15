import {
  defineServerPlugin,
  type AppServerPlugin,
} from '@nocobase/app-server/plugins';

import routes from './routes/index.js';

const databaseExplorerPlugin: AppServerPlugin = defineServerPlugin({
  packageName: '@nocobase/app-plugin-database-explorer',
  locales: () => import('./locales/index.js'),
  routes,
});

export default databaseExplorerPlugin;
