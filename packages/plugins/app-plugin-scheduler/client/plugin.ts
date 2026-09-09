import {
  defineClientPlugin,
  type AppClientPluginFactory,
} from '@nocobase/app-client/plugins';

import locales from './locales/index.js';
import routes from './routes.js';

const scheduler: AppClientPluginFactory = defineClientPlugin({
  packageName: '@nocobase/app-plugin-scheduler',
  locales,
  routes,
});

export default scheduler;
