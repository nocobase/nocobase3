import {
  defineClientModule,
  type AppClientModuleFactory,
} from '@nocobase/app-client/plugins';

export interface DataProviderClientOptions {
  readonly placeholder?: never;
}

const dataProvider: AppClientModuleFactory<DataProviderClientOptions> =
  defineClientModule({
    packageName: '@nocobase/app-plugin-data-provider',
    bootstrap: () => import('./bootstrap.js'),
  });

export default dataProvider;
