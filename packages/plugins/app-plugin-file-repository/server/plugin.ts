import {
  defineServerPlugin,
  type AppServerPlugin,
} from '@nocobase/app-server/plugins';
import serviceProviders from './providers/index.js';
const plugin: AppServerPlugin = defineServerPlugin({
  packageName: '@nocobase/app-plugin-file-repository',
  serviceProviders,
});
export default plugin;
