import { appApiClientToken, ClientApplication } from '@nocobase/app-client';
import type { ClientServiceProviderConstructor } from '@nocobase/app-client/plugins';
import { ServiceProvider } from '@nocobase/service-provider';

import { configureMailClient } from './runtime.js';

export class MailClientServiceProvider extends ServiceProvider<ClientApplication> {
  public readonly name: string = '@nocobase/app-plugin-mail/client';

  public override boot(): Promise<void> {
    configureMailClient(this.app.container.resolve(appApiClientToken));
    return Promise.resolve();
  }
}

const serviceProviders: readonly ClientServiceProviderConstructor[] = [
  MailClientServiceProvider,
];

export default serviceProviders;
