import {
  defineServerPlugin,
  type AppPluginApplication,
  type AppServerPlugin,
} from '@nocobase/app-server-kit/plugins';
import {
  defineApiRoutes,
  type AppApiRoutes,
} from '@nocobase/app-server-kit/router';

import InAppNotificationProvider from './provider.js';
import registerInAppNotificationRoutes from './routes/index.js';

const inAppNotificationApiRoutes: AppApiRoutes<AppPluginApplication> =
  defineApiRoutes({
    name: '@nocobase/app-plugin-notification-in-app/api',
    register(router, app): void {
      registerInAppNotificationRoutes(app, router);
    },
  });

const inAppNotificationPlugin: AppServerPlugin = defineServerPlugin({
  packageName: '@nocobase/app-plugin-notification-in-app',
  providers: [InAppNotificationProvider],
  apiRoutes: [inAppNotificationApiRoutes],
  database: {
    migrations: './database/migrations',
  },
});

export default inAppNotificationPlugin;
