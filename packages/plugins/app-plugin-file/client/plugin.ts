import {
  defineClientPlugin,
  type AppClientPluginFactory,
} from '@nocobase/app-client/plugins';

import locales from './locales/index.js';
import routes from './routes.js';

export interface FileClientOptions {
  readonly placeholder?: never;
}

const file: AppClientPluginFactory<FileClientOptions> = defineClientPlugin({
  packageName: '@nocobase/app-plugin-file',
  locales,
  routes,
});

export default file;
