import {
  defineServerPlugin,
  type AppServerPlugin,
} from '@nocobase/app-server/plugins';

import serviceProviders from './providers/index.js';
import routes from './routes/index.js';
import type { NotificationProvidersPluginConfig } from './bootstrap.js';

const notificationProvidersPlugin: AppServerPlugin<NotificationProvidersPluginConfig> =
  defineServerPlugin<NotificationProvidersPluginConfig>({
    packageName: '@nocobase/app-plugin-notification-providers',
    serviceProviders,
    routes,
  });

export default notificationProvidersPlugin;
