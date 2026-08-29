import {
  defineClientPlugin,
  type AppClientPluginFactory,
} from '@nocobase/app-client/plugins';

export interface FileClientOptions {
  readonly placeholder?: never;
}

const file: AppClientPluginFactory<FileClientOptions> = defineClientPlugin({
  packageName: '@nocobase/app-plugin-file',
  routes: () => import('./routes.js'),
});

export default file;
