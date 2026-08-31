import { appApiClientToken, ClientApplication } from '@nocobase/app-client';
import { ServiceProvider } from '@nocobase/service-provider';

import { configureNotificationClient } from './runtime.js';

export class NotificationServiceProvider extends ServiceProvider<ClientApplication> {
  public readonly name: string = '@nocobase/app-plugin-notification/client';

  public override boot(): Promise<void> {
    configureNotificationClient(this.app.container.resolve(appApiClientToken));
    return Promise.resolve();
  }
}
