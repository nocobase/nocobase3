import {
  defineServerPlugin,
  type AppPluginApplication,
  type AppServerPlugin,
} from '@nocobase/app-server-kit/plugins';
import {
  defineApiRoutes,
  type AppApiRoutes,
} from '@nocobase/app-server-kit/router';

import type { NotificationProvidersPluginConfig } from './bootstrap.js';
import NotificationProvidersProvider from './provider.js';
import registerNotificationProviderRoutes from './routes/index.js';

const notificationProviderApiRoutes: AppApiRoutes<
  AppPluginApplication<NotificationProvidersPluginConfig>
> = defineApiRoutes({
  name: '@nocobase/app-plugin-notification-providers/api',
  register(router, app): void {
    registerNotificationProviderRoutes(app, router);
  },
});

const notificationProvidersPlugin: AppServerPlugin<NotificationProvidersPluginConfig> =
  defineServerPlugin({
    packageName: '@nocobase/app-plugin-notification-providers',
    providers: [NotificationProvidersProvider],
    apiRoutes: [notificationProviderApiRoutes],
  });

export default notificationProvidersPlugin;
