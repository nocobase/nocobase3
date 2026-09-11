import {
  defineClientPlugin,
  type AppClientPluginFactory,
} from '@nocobase/app-client/plugins';
import routes from './routes.js';
import locales from './locales/index.js';
const plugin: AppClientPluginFactory = defineClientPlugin({
  packageName: '@nocobase/app-plugin-file-example',
  routes,
  locales,
});
export default plugin;
