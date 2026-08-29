import {
  defineServerPlugin,
  type AppServerPlugin,
} from '@nocobase/app-server-kit/plugins';

import type { NotificationProvidersPluginConfig } from './bootstrap.js';
import NotificationProvidersProvider from './provider.js';
import routes from './routes/index.js';

const notificationProvidersPlugin: AppServerPlugin<NotificationProvidersPluginConfig> =
  defineServerPlugin({
    packageName: '@nocobase/app-plugin-notification-providers',
    providers: [NotificationProvidersProvider],
    routes,
  });

export default notificationProvidersPlugin;
