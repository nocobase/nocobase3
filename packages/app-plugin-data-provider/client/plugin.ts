import {
  defineClientPlugin,
  type AppClientPluginFactory,
} from '@nocobase/app-client/plugins';

import { DataProviderServiceProvider } from './service-provider.js';

export interface DataProviderClientOptions {
  readonly placeholder?: never;
}

const dataProvider: AppClientPluginFactory<DataProviderClientOptions> =
  defineClientPlugin({
    packageName: '@nocobase/app-plugin-data-provider',
    serviceProviders: [DataProviderServiceProvider],
  });

export default dataProvider;
