import {
  defineServerPlugin,
  type AppServerPlugin,
} from '@nocobase/app-server/plugins';

import routes from './routes/index.js';

const repositoryExamplePlugin: AppServerPlugin = defineServerPlugin({
  packageName: '@nocobase/app-plugin-repository-example',
  routes,
  database: {
    migrations: './database/migrations',
    seeds: './database/seeds',
  },
});

export default repositoryExamplePlugin;
