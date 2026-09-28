import path from 'node:path';

import {
  defineServerPlugin,
  type AppServerPlugin,
} from '@nocobase/app-server/plugins';

const authzDefaultAccessPlugin: AppServerPlugin = defineServerPlugin({
  baseDir: path.resolve(import.meta.dirname, '..'),
  packageName: '@nocobase/app-plugin-authz-default-access',
  locales: () => import('./locales/index.js'),
  database: {
    migrations: './database/migrations',
  },
});

export default authzDefaultAccessPlugin;
