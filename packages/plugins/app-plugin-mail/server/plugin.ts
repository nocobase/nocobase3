import {
  defineServerPlugin,
  type AppServerPlugin,
} from '@nocobase/app-server/plugins';

import serviceProviders from './providers/index.js';
import routes from './routes/index.js';
import { mailConfig } from './config.js';

const mailPlugin: AppServerPlugin = defineServerPlugin({
  packageName: '@nocobase/app-plugin-mail',
  config: mailConfig,
  serviceProviders,
  routes,
  database: {
    migrations: './database/migrations',
  },
});

export default mailPlugin;
