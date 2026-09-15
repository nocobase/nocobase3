import path from 'node:path';

import {
  defineServerPlugin,
  type AppServerPlugin,
} from '@nocobase/app-server/plugins';

const databaseExamplePlugin: AppServerPlugin = defineServerPlugin({
  baseDir: path.resolve(import.meta.dirname, '..'),
  packageName: '@nocobase/app-plugin-database-example',
  database: {
    migrations: './database/migrations',
    seeds: './database/seeds',
  },
});

export default databaseExamplePlugin;
