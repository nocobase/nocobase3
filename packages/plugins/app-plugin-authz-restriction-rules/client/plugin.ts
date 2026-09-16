import {
  defineClientPlugin,
  type AppClientPluginFactory,
} from '@nocobase/app-client/plugins';

import locales from './locales/index.js';
import routes from './routes.js';

const authzRestrictionRules: AppClientPluginFactory = defineClientPlugin({
  packageName: '@nocobase/app-plugin-authz-restriction-rules',
  locales,
  routes,
});

export default authzRestrictionRules;
