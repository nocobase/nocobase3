import {
  defineClientPlugin,
  type AppClientPluginFactory,
} from '@nocobase/app-client/plugins';

import routes from './routes.js';

export interface FileClientOptions {
  readonly placeholder?: never;
}

const file: AppClientPluginFactory<FileClientOptions> = defineClientPlugin({
  packageName: '@nocobase/app-plugin-file',
  routes,
});

export default file;
