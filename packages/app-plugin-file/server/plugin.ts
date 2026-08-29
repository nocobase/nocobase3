import {
  defineServerPlugin,
  type AppPluginApplication,
  type AppServerPlugin,
} from '@nocobase/app-server-kit/plugins';
import {
  defineApiRoutes,
  type AppApiRoutes,
} from '@nocobase/app-server-kit/router';

import FileProvider, { type FileProviderApplication } from './provider.js';
import registerFileRoutes from './routes/index.js';

const fileApiRoutes: AppApiRoutes<FileProviderApplication> = defineApiRoutes({
  name: '@nocobase/app-plugin-file/api',
  register(router, app): void {
    registerFileRoutes(app, router);
  },
});

const filePlugin: AppServerPlugin<FileProviderApplication['config']> =
  defineServerPlugin({
    packageName: '@nocobase/app-plugin-file',
    providers: [FileProvider],
    apiRoutes: [
      fileApiRoutes as AppApiRoutes<
        AppPluginApplication<FileProviderApplication['config']>
      >,
    ],
    database: {
      migrations: './database/migrations',
      seeds: './database/seeds',
    },
  });

export default filePlugin;
