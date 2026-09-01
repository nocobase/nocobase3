import { notificationServiceToken } from '@nocobase/app-plugin-notification';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { ServiceProvider } from '@nocobase/service-provider';

import { registerBuiltInNotificationProviders } from './bootstrap.js';

export type NotificationProvidersApplication = AppPluginApplication;

export default class NotificationProvidersProvider<
  TApplication extends NotificationProvidersApplication =
    NotificationProvidersApplication,
> extends ServiceProvider<TApplication> {
  public readonly name: string = '@nocobase/app-plugin-notification-providers';

  public override async boot(): Promise<void> {
    if (!this.app.container.has(notificationServiceToken)) return;
    registerBuiltInNotificationProviders(
      this.app.container.resolve(notificationServiceToken),
    );
  }
}
