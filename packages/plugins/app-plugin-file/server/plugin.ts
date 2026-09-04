import {
  defineServerPlugin,
  type AppServerPlugin,
} from '@nocobase/app-server/plugins';

import { fileSettingsApiRoutes } from './settings/routes.js';

const filePlugin: AppServerPlugin = defineServerPlugin({
  packageName: '@nocobase/app-plugin-file',
  locales: () => import('./locales/index.js'),
  routes: [fileSettingsApiRoutes],
});

export default filePlugin;
