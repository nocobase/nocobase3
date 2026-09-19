import path from 'node:path';

import {
  defineServerPlugin,
  type AppServerPlugin,
} from '@nocobase/app-server/plugins';

import routes from './routes/index.js';

/**
 * No Server locales. Failures answer with a stable `code` and a fixed English
 * message, and the Client renders the wording for that code in the viewer's
 * language. Declaring Server locale resources that nothing consults would read
 * as translated API errors without producing any.
 */
const databaseExplorerPlugin: AppServerPlugin = defineServerPlugin({
  baseDir: path.resolve(import.meta.dirname, '..'),
  packageName: '@nocobase/app-plugin-database-explorer',
  routes,
});

export default databaseExplorerPlugin;
