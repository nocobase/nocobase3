import routes from './routes.js';
import path from 'node:path';

import {
  defineServerPlugin,
  type AppServerPlugin,
} from '@nocobase/app-server/plugins';

const authzRestrictionRulesPlugin: AppServerPlugin = defineServerPlugin({
  baseDir: path.resolve(import.meta.dirname, '..'),
  packageName: '@nocobase/app-plugin-authz-restriction-rules',
  routes,
  locales: () => import('./locales/index.js'),
  database: {
    migrations: './database/migrations',
    seeds: './database/seeds',
  },
});

export default authzRestrictionRulesPlugin;
