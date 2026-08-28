import {
  defineServerPlugin,
  type AppPluginApplication,
  type AppServerPlugin,
} from '@nocobase/app-server-kit/plugins';
import {
  defineApiRoutes,
  type AppApiRoutes,
} from '@nocobase/app-server-kit/router';

import registerRoutesExampleRoutes from './routes/index.js';

const routesExampleApiRoutes: AppApiRoutes<AppPluginApplication> =
  defineApiRoutes({
    name: '@nocobase/app-plugin-routes-example/api',
    register(router): void {
      registerRoutesExampleRoutes(router);
    },
  });

const routesExamplePlugin: AppServerPlugin = defineServerPlugin({
  packageName: '@nocobase/app-plugin-routes-example',
  apiRoutes: [routesExampleApiRoutes],
});

export default routesExamplePlugin;
