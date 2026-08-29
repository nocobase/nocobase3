import {
  defineServerPlugin,
  type AppServerPlugin,
} from '@nocobase/app-server-kit/plugins';

import type { FileProviderApplication } from './providers/file.js';
import providers from './providers/index.js';
import routes from './routes/index.js';

const filePlugin: AppServerPlugin<FileProviderApplication['config']> =
  defineServerPlugin({
    packageName: '@nocobase/app-plugin-file',
    providers,
    routes,
    database: {
      migrations: './database/migrations',
      seeds: './database/seeds',
    },
  });

export default filePlugin;
