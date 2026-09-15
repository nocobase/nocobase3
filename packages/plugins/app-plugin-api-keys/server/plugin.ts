import {
  defineServerPlugin,
  type AppServerPlugin,
} from '@nocobase/app-server/plugins';

const apiKeysPlugin: AppServerPlugin = defineServerPlugin({
  packageName: '@nocobase/app-plugin-api-keys',
  database: {
    migrations: './database/migrations',
  },
});

export default apiKeysPlugin;
