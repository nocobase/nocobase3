import { apiClientToken, ClientApplication } from '@nocobase/app-client';
import type { ClientServiceProviderConstructor } from '@nocobase/app-client/plugins';
import { ServiceProvider } from '@nocobase/service-provider';

import { configureLocaleClient } from './use-locale.js';

export class I18nServiceProvider extends ServiceProvider<ClientApplication> {
  public readonly name: string = '@nocobase/app-plugin-i18n/client';

  public override boot(): Promise<void> {
    configureLocaleClient(this.app.container.resolve(apiClientToken));
    return Promise.resolve();
  }
}

const serviceProviders: readonly ClientServiceProviderConstructor[] = [
  I18nServiceProvider,
];

export default serviceProviders;
