import {
  defineClientPlugin,
  type AppClientPluginFactory,
} from '@nocobase/app-client/plugins';

import locales from './locales/index.js';
import settingsRoutes from './settings/routes.js';

const file: AppClientPluginFactory = defineClientPlugin({
  packageName: '@nocobase/app-plugin-file',
  locales,
  routes: settingsRoutes,
});

export default file;
