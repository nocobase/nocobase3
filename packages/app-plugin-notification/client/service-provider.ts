import { appApiClientToken, ClientApplication } from '@nocobase/app-client';
import type { ClientServiceProviderConstructor } from '@nocobase/app-client/plugins';
import { ServiceProvider } from '@nocobase/service-provider';

import { configureNotificationClient } from './runtime.js';

export class NotificationServiceProvider extends ServiceProvider<ClientApplication> {
  public readonly name: string = '@nocobase/app-plugin-notification/client';

  public override boot(): Promise<void> {
    configureNotificationClient(this.app.container.resolve(appApiClientToken));
    return Promise.resolve();
  }
}

const serviceProviders: readonly ClientServiceProviderConstructor[] = [
  NotificationServiceProvider,
];

export default serviceProviders;
