import {
  defineServerPlugin,
  type AppServerPlugin,
} from '@nocobase/app-server-kit/plugins';

import routes, { type InstallPluginConfig } from './routes/index.js';

const installPlugin: AppServerPlugin<InstallPluginConfig> = defineServerPlugin({
  packageName: '@nocobase/app-plugin-install',
  routes,
});

export default installPlugin;
