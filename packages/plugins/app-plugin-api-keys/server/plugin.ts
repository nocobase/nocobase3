import path from 'node:path';

import {
  defineServerPlugin,
  type AppServerPlugin,
} from '@nocobase/app-server/plugins';

const apiKeysPlugin: AppServerPlugin = defineServerPlugin({
  baseDir: path.resolve(import.meta.dirname, '..'),
  packageName: '@nocobase/app-plugin-api-keys',
  database: {
    migrations: './database/migrations',
  },
});

export default apiKeysPlugin;
