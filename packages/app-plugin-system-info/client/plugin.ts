import {
  defineClientPlugin,
  type AppClientPluginFactory,
} from '@nocobase/app-client/plugins';

import routes from './routes.js';

const systemInfo: AppClientPluginFactory = defineClientPlugin({
  packageName: '@nocobase/app-plugin-system-info',
  routes,
});

export default systemInfo;
