import { databaseManagerToken } from '@nocobase/app-database';
import { notificationServiceToken } from '@nocobase/app-plugin-notification';
import { ServiceProvider } from '@nocobase/service-provider';
import type { AppPluginApplication } from '@nocobase/app-server-kit/plugins';

import {
  createDatabaseProviderDefinition,
  createInAppChannelDefinition,
} from '../definition.js';
import { createInAppStore } from '../store.js';
import { inAppNotificationStoreToken } from '../tokens.js';

export type InAppNotificationProviderApplication = AppPluginApplication;

export class InAppNotificationProvider<
  TApplication extends InAppNotificationProviderApplication =
    InAppNotificationProviderApplication,
> extends ServiceProvider<TApplication> {
  public readonly name: string = '@nocobase/app-plugin-notification-in-app';

  public override register(): void {
    if (!this.app.container.has(databaseManagerToken)) return;
    this.app.container.singleton(inAppNotificationStoreToken, (container) =>
      createInAppStore(container.resolve(databaseManagerToken)),
    );
  }

  public override async boot(): Promise<void> {
    const { container } = this.app;
    if (!container.has(notificationServiceToken)) return;
    if (!container.has(inAppNotificationStoreToken)) {
      throw new Error(
        'In-app notifications require the application database dependency.',
      );
    }

    const notification = container.resolve(notificationServiceToken);
    const store = container.resolve(inAppNotificationStoreToken);
    notification.registry
      .registerChannel(createInAppChannelDefinition())
      .registerProvider('in-app', createDatabaseProviderDefinition({ store }));
  }
}
