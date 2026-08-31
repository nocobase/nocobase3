import {
  defineClientPlugin,
  type AppClientPluginFactory,
} from '@nocobase/app-client/plugins';

import reactWrappers from './react-wrappers.js';
import routes from './routes.js';

const routesExample: AppClientPluginFactory = defineClientPlugin({
  packageName: '@nocobase/app-plugin-routes-example',
  routes,
  reactWrappers,
});

export default routesExample;
