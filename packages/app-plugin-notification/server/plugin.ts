import {
  defineServerPlugin,
  type AppPluginApplication,
  type AppServerPlugin,
} from '@nocobase/app-server-kit/plugins';
import {
  defineApiRoutes,
  type AppApiRoutes,
} from '@nocobase/app-server-kit/router';

import NotificationProvider, {
  type NotificationProviderApplicationConfig,
} from './provider.js';
import registerNotificationRoutes from './routes/index.js';

const notificationApiRoutes: AppApiRoutes<
  AppPluginApplication<NotificationProviderApplicationConfig>
> = defineApiRoutes({
  name: '@nocobase/app-plugin-notification/api',
  register(router, app): void {
    registerNotificationRoutes(app, router);
  },
});

const notificationPlugin: AppServerPlugin<NotificationProviderApplicationConfig> =
  defineServerPlugin({
    packageName: '@nocobase/app-plugin-notification',
    providers: [NotificationProvider],
    apiRoutes: [notificationApiRoutes],
    database: {
      migrations: './database/migrations',
    },
  });

export default notificationPlugin;
