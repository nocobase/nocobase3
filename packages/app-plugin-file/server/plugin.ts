import {
  defineServerPlugin,
  type AppServerPlugin,
} from '@nocobase/app-server-kit/plugins';

import serviceProviders from './providers/index.js';
import routes from './routes/index.js';
import type { FileProviderApplication } from './providers/file.js';

const filePlugin: AppServerPlugin<FileProviderApplication['config']> =
  defineServerPlugin<FileProviderApplication['config']>({
    packageName: '@nocobase/app-plugin-file',
    serviceProviders,
    routes,
    database: {
      migrations: './database/migrations',
      seeds: './database/seeds',
    },
  });

export default filePlugin;
