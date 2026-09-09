import {
  defineServerPlugin,
  type AppServerPlugin,
} from '@nocobase/app-server/plugins';

import serviceProviders from './providers/index.js';
import routes from './routes/index.js';

const usersPlugin: AppServerPlugin = defineServerPlugin({
  packageName: '@nocobase/app-plugin-users',
  locales: () => import('./locales/index.js'),
  serviceProviders,
  routes,
});

export default usersPlugin;
