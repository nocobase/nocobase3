import {
  defineServerPlugin,
  type AppServerPlugin,
} from '@nocobase/app-server/plugins';

import serviceProviders from './providers/index.js';

const notificationProvidersPlugin: AppServerPlugin = defineServerPlugin({
  packageName: '@nocobase/app-plugin-notification-providers',
  locales: () => import('./locales/index.js'),
  serviceProviders,
});

export default notificationProvidersPlugin;
