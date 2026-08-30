import {
  defineClientPlugin,
  type AppClientPluginFactory,
} from '@nocobase/app-client/plugins';

const systemInfo: AppClientPluginFactory = defineClientPlugin({
  packageName: '@nocobase/app-plugin-system-info',
  routes: () => import('./routes.js'),
});

export default systemInfo;
