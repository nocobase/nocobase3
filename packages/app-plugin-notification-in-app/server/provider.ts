import { databaseManagerToken } from '@nocobase/app-database';
import { notificationServiceToken } from '@nocobase/app-plugin-notification';
import {
  ServiceProvider,
  type ServiceContainer,
} from '@nocobase/service-provider';

import {
  createDatabaseProviderDefinition,
  createInAppChannelDefinition,
} from './definition.js';
import { createInAppStore } from './store.js';
import { inAppNotificationStoreToken } from './token.js';

export interface InAppNotificationProviderApplication {
  readonly container: ServiceContainer;
}

export default class InAppNotificationProvider<
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
