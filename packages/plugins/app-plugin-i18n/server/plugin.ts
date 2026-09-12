import {
  defineServerPlugin,
  type AppServerPlugin,
} from '@nocobase/app-server/plugins';

import routes from './routes.js';

const i18nPlugin: AppServerPlugin = defineServerPlugin({
  packageName: '@nocobase/app-plugin-i18n',
  routes,
});

export default i18nPlugin;
