import {
  defineClientPlugin,
  type AppClientPluginFactory,
} from '@nocobase/app-client/plugins';
import locales from './locales/settings/index.js';
import routes from './routes.js';
import serviceProviders from './service-provider.js';

const audit: AppClientPluginFactory = defineClientPlugin({
  packageName: '@nocobase/app-plugin-audit',
  locales,
  serviceProviders,
  routes,
});
export default audit;
