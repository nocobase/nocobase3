import {
  defineServerPlugin,
  type AppServerPlugin,
} from '@nocobase/app-server-kit/plugins';

import routes from './routes/index.js';

const routesExamplePlugin: AppServerPlugin = defineServerPlugin({
  packageName: '@nocobase/app-plugin-routes-example',
  routes,
});

export default routesExamplePlugin;
