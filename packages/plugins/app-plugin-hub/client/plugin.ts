import {
  defineClientPlugin,
  type AppClientPluginFactory,
} from '@nocobase/app-client/plugins';

import locales from './locales/index.js';
import serviceProviders from './providers/index.js';
import routes from './routes.js';

const hub: AppClientPluginFactory = defineClientPlugin({
  packageName: '@nocobase/app-plugin-hub',
  locales,
  routes,
  serviceProviders,
});

export default hub;
