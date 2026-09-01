import {
  defineServerPlugin,
  type AppServerPlugin,
} from '@nocobase/app-server/plugins';

import serviceProviders from './providers/index.js';
import routes from './routes/index.js';
import { notificationConfig } from './config.js';
import type { NotificationProviderApplicationConfig } from './providers/notification.js';

const notificationPlugin: AppServerPlugin<NotificationProviderApplicationConfig> =
  defineServerPlugin<NotificationProviderApplicationConfig>({
    packageName: '@nocobase/app-plugin-notification',
    config: notificationConfig,
    serviceProviders,
    routes,
    database: {
      migrations: './database/migrations',
    },
  });

export default notificationPlugin;
