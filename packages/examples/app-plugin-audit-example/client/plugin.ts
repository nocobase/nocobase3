import {
  defineClientPlugin,
  type AppClientPluginFactory,
} from '@nocobase/app-client/plugins';

import locales from './locales/index.js';
import routes from './routes.js';

const auditExample: AppClientPluginFactory = defineClientPlugin({
  packageName: '@nocobase/app-plugin-audit-example',
  locales,
  routes,
});

export default auditExample;
