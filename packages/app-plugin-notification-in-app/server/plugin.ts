import {
  defineServerPlugin,
  type AppServerPlugin,
} from '@nocobase/app-server-kit/plugins';

import providers from './providers/index.js';
import routes from './routes/index.js';

const inAppNotificationPlugin: AppServerPlugin = defineServerPlugin({
  packageName: '@nocobase/app-plugin-notification-in-app',
  serviceProviders: providers,
  routes,
  database: {
    migrations: './database/migrations',
  },
});

export default inAppNotificationPlugin;
