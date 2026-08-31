import {
  defineClientPlugin,
  type AppClientPluginFactory,
} from '@nocobase/app-client/plugins';

import reactProviders from './react-providers.js';
import routes from './routes.js';

const routesExample: AppClientPluginFactory = defineClientPlugin({
  packageName: '@nocobase/app-plugin-routes-example',
  routes,
  reactProviders,
});

export default routesExample;
