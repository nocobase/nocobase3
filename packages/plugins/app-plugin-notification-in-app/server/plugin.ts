import {
  defineServerPlugin,
  type AppServerPlugin,
} from '@nocobase/app-server/plugins';

import serviceProviders from './providers/index.js';
import routes from './routes/index.js';

const inAppNotificationPlugin: AppServerPlugin = defineServerPlugin({
  packageName: '@nocobase/app-plugin-notification-in-app',
  locales: () => import('./locales/index.js'),
  serviceProviders,
  routes,
  database: {
    migrations: './database/migrations',
  },
});

export default inAppNotificationPlugin;
