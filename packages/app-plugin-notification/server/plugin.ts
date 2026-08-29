import {
  defineServerPlugin,
  type AppPluginApplication,
  type AppServerPlugin,
} from '@nocobase/app-server-kit/plugins';
import {
  defineApiRoutes,
  type AppApiRoutes,
} from '@nocobase/app-server-kit/router';

import { notificationConfig } from './config.js';
import NotificationProvider from './provider.js';
import registerNotificationRoutes from './routes/index.js';

const notificationApiRoutes: AppApiRoutes<AppPluginApplication> =
  defineApiRoutes({
    name: '@nocobase/app-plugin-notification/api',
    register(router, app): void {
      registerNotificationRoutes(app, router);
    },
  });

const notificationPlugin: AppServerPlugin = defineServerPlugin({
  packageName: '@nocobase/app-plugin-notification',
  config: notificationConfig,
  providers: [NotificationProvider],
  apiRoutes: [notificationApiRoutes],
  database: {
    migrations: './database/migrations',
  },
});

export default notificationPlugin;
