import {
  defineClientPlugin,
  type AppClientPluginFactory,
} from '@nocobase/app-client/plugins';

import locales from './locales/index.js';
import routes from './routes.js';

const authorizationExample: AppClientPluginFactory = defineClientPlugin({
  packageName: '@nocobase/app-plugin-authorization-example',
  locales,
  routes,
});

export default authorizationExample;
