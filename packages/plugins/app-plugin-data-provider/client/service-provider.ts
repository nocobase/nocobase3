import { ClientApplication } from '@nocobase/app-client';
import type { ClientServiceProviderConstructor } from '@nocobase/app-client/plugins';
import { ServiceProvider } from '@nocobase/service-provider';

import { dataProvider } from './data-provider.js';

export class DataProviderServiceProvider extends ServiceProvider<ClientApplication> {
  public readonly name: string = '@nocobase/app-plugin-data-provider/client';

  public override boot(): Promise<void> {
    this.app.refine.setDataProvider(dataProvider);
    return Promise.resolve();
  }
}

const serviceProviders: readonly ClientServiceProviderConstructor[] = [
  DataProviderServiceProvider,
];

export default serviceProviders;
