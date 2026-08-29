import {
  defineServerPlugin,
  type AppPluginApplication,
  type AppServerPlugin,
} from '@nocobase/app-server-kit/plugins';
import {
  defineRootRoutes,
  type AppRootRoutes,
} from '@nocobase/app-server-kit/router';

import registerInstallRoutes, {
  type InstallPluginConfig,
} from './routes/index.js';

const installRootRoutes: AppRootRoutes<
  AppPluginApplication<InstallPluginConfig>
> = defineRootRoutes({
  name: '@nocobase/app-plugin-install/root',
  register(router, app): void {
    registerInstallRoutes(app, router);
  },
});

const installPlugin: AppServerPlugin<InstallPluginConfig> = defineServerPlugin({
  packageName: '@nocobase/app-plugin-install',
  rootRoutes: [installRootRoutes],
});

export default installPlugin;
