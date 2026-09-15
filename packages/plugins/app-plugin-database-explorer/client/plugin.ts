import {
  defineClientPlugin,
  type AppClientPluginFactory,
} from '@nocobase/app-client/plugins';

import locales from './locales/index.js';
import routes from './routes.js';

const databaseExplorer: AppClientPluginFactory = defineClientPlugin({
  packageName: '@nocobase/app-plugin-database-explorer',
  locales,
  routes,
});

export default databaseExplorer;
