import {
  defineClientPlugin,
  type AppClientPluginFactory,
} from '@nocobase/app-client/plugins';

import locales from './locales/index.js';
import routes from './routes.js';

const authzDefaultAccess: AppClientPluginFactory = defineClientPlugin({
  packageName: '@nocobase/app-plugin-authz-default-access',
  locales,
  routes,
});

export default authzDefaultAccess;
