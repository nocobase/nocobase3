import {
  defineServerPlugin,
  type AppServerPlugin,
} from '@nocobase/app-server-kit/plugins';

import type { NotificationProviderApplicationConfig } from './providers/notification.js';
import providers from './providers/index.js';
import routes from './routes/index.js';

const notificationPlugin: AppServerPlugin<NotificationProviderApplicationConfig> =
  defineServerPlugin({
    packageName: '@nocobase/app-plugin-notification',
    providers,
    routes,
    database: {
      migrations: './database/migrations',
    },
  });

export default notificationPlugin;
