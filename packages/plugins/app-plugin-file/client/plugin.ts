import {
  defineClientPlugin,
  type AppClientPluginFactory,
} from '@nocobase/app-client/plugins';

import locales from './locales/index.js';
import routes from './routes.js';

const file: AppClientPluginFactory = defineClientPlugin({
  packageName: '@nocobase/app-plugin-file',
  locales,
  routes,
});

export default file;
