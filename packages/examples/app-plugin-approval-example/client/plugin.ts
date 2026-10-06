import {
  defineClientPlugin,
  type AppClientPluginFactory,
} from '@nocobase/app-client/plugins';

import locales from './locales/index.js';
import routes from './routes.js';

const approvalExample: AppClientPluginFactory = defineClientPlugin({
  packageName: '@nocobase/app-plugin-approval-example',
  locales,
  routes,
});

export default approvalExample;
