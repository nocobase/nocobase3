import {
  defineClientPlugin,
  type AppClientPluginFactory,
} from '@nocobase/app-client/plugins';

import locales from './locales/index.js';

const file: AppClientPluginFactory = defineClientPlugin({
  packageName: '@nocobase/app-plugin-file',
  locales,
});

export default file;
