import {
  defineServerPlugin,
  type AppPluginApplication,
  type AppServerPlugin,
} from '@nocobase/app-server-kit/plugins';
import {
  defineRootRoutes,
  type AppRootRoutes,
} from '@nocobase/app-server-kit/router';

import registerInstallRoutes from './routes/index.js';

const installRootRoutes: AppRootRoutes<AppPluginApplication> = defineRootRoutes(
  {
    name: '@nocobase/app-plugin-install/root',
    register(router, app): void {
      registerInstallRoutes(app, router);
    },
  },
);

const installPlugin: AppServerPlugin = defineServerPlugin({
  packageName: '@nocobase/app-plugin-install',
  rootRoutes: [installRootRoutes],
});

export default installPlugin;
