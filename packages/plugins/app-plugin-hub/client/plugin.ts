import {
  defineClientPlugin,
  type AppClientPluginFactory,
} from '@nocobase/app-client/plugins';

import serviceProviders from './providers/index.js';
import reactProviders from './react-providers.js';
import locales from './locales/index.js';
import routes from './routes.js';

const hub: AppClientPluginFactory = defineClientPlugin({
  packageName: '@nocobase/app-plugin-hub',
  locales,
  serviceProviders,
  reactProviders,
  routes,
});

export default hub;
