import {
  defineClientPlugin,
  type AppClientPluginFactory,
} from '@nocobase/app-client/plugins';

import serviceProviders from './service-provider.js';

export interface DataProviderClientOptions {
  readonly placeholder?: never;
}

const dataProvider: AppClientPluginFactory<DataProviderClientOptions> =
  defineClientPlugin({
    packageName: '@nocobase/app-plugin-data-provider',
    serviceProviders,
  });

export default dataProvider;
