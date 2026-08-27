import {
  defineClientPlugin,
  type AppClientPluginFactory,
} from '@nocobase/app-client/plugins';

export interface DataProviderClientOptions {
  readonly placeholder?: never;
}

const dataProvider: AppClientPluginFactory<DataProviderClientOptions> =
  defineClientPlugin({
    packageName: '@nocobase/app-plugin-data-provider',
    bootstrap: () => import('./bootstrap.js'),
  });

export default dataProvider;
