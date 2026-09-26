import {
  defineClientPlugin,
  type AppClientPluginFactory,
} from '@nocobase/app-client/plugins';

import locales from './locales/index.js';
import routes from './routes.js';

const departmentsExample: AppClientPluginFactory = defineClientPlugin({
  packageName: '@nocobase/app-plugin-departments-example',
  locales,
  routes,
});

export default departmentsExample;
