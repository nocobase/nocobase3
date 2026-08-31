import {
  ClientApplication,
  type ClientServiceProviderContext,
} from '@nocobase/app-client';
import { ServiceProvider } from '@nocobase/service-provider';

import { createNotificationProvider } from './notification-provider.js';
import type { NotificationProviderClientOptions } from './plugin.js';

export class NotificationProviderServiceProvider extends ServiceProvider<ClientApplication> {
  public readonly name: string =
    '@nocobase/app-plugin-notification-provider/client';

  public constructor(
    app: ClientApplication,
    private readonly context: ClientServiceProviderContext<NotificationProviderClientOptions>,
  ) {
    super(app);
  }

  public override boot(): Promise<void> {
    this.app.refine.setNotificationProvider(
      createNotificationProvider(this.context.options),
    );
    return Promise.resolve();
  }
}
