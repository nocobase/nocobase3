import {
  defineServerPlugin,
  type AppServerPlugin,
} from '@nocobase/app-server-kit/plugins';

import NotificationProvidersProvider from './provider.js';
import routes from './routes/index.js';
import type { NotificationProvidersPluginConfig } from './bootstrap.js';

const notificationProvidersPlugin: AppServerPlugin<NotificationProvidersPluginConfig> =
  defineServerPlugin<NotificationProvidersPluginConfig>({
    packageName: '@nocobase/app-plugin-notification-providers',
    providers: [NotificationProvidersProvider],
    routes,
  });

export default notificationProvidersPlugin;
