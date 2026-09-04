import {
  defineClientPlugin,
  type AppClientPluginFactory,
} from '@nocobase/app-client/plugins';

import locales from './locales/index.js';
import routes from './routes.js';

const notificationInApp: AppClientPluginFactory = defineClientPlugin({
  packageName: '@nocobase/app-plugin-notification-in-app',
  locales,
  routes,
});

export default notificationInApp;
