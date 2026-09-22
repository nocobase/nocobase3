import {
  defineClientPlugin,
  type AppClientPluginFactory,
} from '@nocobase/app-client/plugins';

import locales from './locales/index.js';
import routes from './routes.js';

const authzSharingRules: AppClientPluginFactory = defineClientPlugin({
  packageName: '@nocobase/app-plugin-authz-sharing-rules',
  locales,
  routes,
});

export default authzSharingRules;
