import path from 'node:path';

import {
  defineServerPlugin,
  type AppServerPlugin,
} from '@nocobase/app-server/plugins';

import routes, { type InstallPluginConfig } from './routes/index.js';

const installPlugin: AppServerPlugin<InstallPluginConfig> =
  defineServerPlugin<InstallPluginConfig>({
    baseDir: path.resolve(import.meta.dirname, '..'),
    packageName: '@nocobase/app-plugin-install',
    routes,
  });

export default installPlugin;
