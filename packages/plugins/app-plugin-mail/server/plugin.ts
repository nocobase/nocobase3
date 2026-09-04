import {
  defineServerPlugin,
  type AppServerPlugin,
} from '@nocobase/app-server/plugins';

import serviceProviders from './providers/index.js';
import routes from './routes/index.js';

const mailPlugin: AppServerPlugin = defineServerPlugin({
  packageName: '@nocobase/app-plugin-mail',
  serviceProviders,
  routes,
  database: {
    migrations: './database/migrations',
  },
});

export default mailPlugin;
