import routes from './routes.js';
import path from 'node:path';

import {
  defineServerPlugin,
  type AppServerPlugin,
} from '@nocobase/app-server/plugins';

const authzSharingRulesPlugin: AppServerPlugin = defineServerPlugin({
  baseDir: path.resolve(import.meta.dirname, '..'),
  packageName: '@nocobase/app-plugin-authz-sharing-rules',
  routes,
  locales: () => import('./locales/index.js'),
  database: {
    migrations: './database/migrations',
    seeds: './database/seeds',
  },
});

export default authzSharingRulesPlugin;
