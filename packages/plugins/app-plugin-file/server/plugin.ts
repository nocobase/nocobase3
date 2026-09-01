import {
  defineServerPlugin,
  type AppServerPlugin,
} from '@nocobase/app-server/plugins';

import serviceProviders, {
  type FileProviderApplication,
} from './providers/index.js';
import routes from './routes/index.js';

const filePlugin: AppServerPlugin<FileProviderApplication['config']> =
  defineServerPlugin<FileProviderApplication['config']>({
    packageName: '@nocobase/app-plugin-file',
    serviceProviders,
    locales: () => import('./locales/index.js'),
    routes,
    database: {
      migrations: './database/migrations',
      seeds: './database/seeds',
    },
  });

export default filePlugin;
