import {
  defineServerPlugin,
  type AppServerPlugin,
} from '@nocobase/app-server/plugins';

const filePlugin: AppServerPlugin = defineServerPlugin({
  packageName: '@nocobase/app-plugin-file',
  locales: () => import('./locales/index.js'),
});

export default filePlugin;
