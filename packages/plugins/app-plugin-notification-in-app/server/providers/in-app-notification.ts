import { databaseManagerToken } from '@nocobase/app-database';
import { notificationServiceToken } from '@nocobase/app-plugin-notification';
import { ServiceProvider } from '@nocobase/service-provider';
import type { AppPluginApplication } from '@nocobase/app-server-kit/plugins';
import {
  realtimeServiceToken,
  type RealtimeUserTopic,
} from '@nocobase/app-server-kit/realtime';

import {
  createDatabaseProviderDefinition,
  createInAppChannelDefinition,
} from '../definition.js';
import {
  createRealtimeInAppStore,
  IN_APP_NOTIFICATION_REALTIME_TOPIC,
  type InAppNotificationRealtimeEvent,
} from '../realtime.js';
import { createInAppStore } from '../store.js';
import { inAppNotificationStoreToken } from '../tokens.js';

export type InAppNotificationProviderApplication = AppPluginApplication;

export class InAppNotificationProvider<
  TApplication extends InAppNotificationProviderApplication =
    InAppNotificationProviderApplication,
> extends ServiceProvider<TApplication> {
  public readonly name: string = '@nocobase/app-plugin-notification-in-app';

  private realtimeTopic:
    RealtimeUserTopic<InAppNotificationRealtimeEvent> | undefined;

  public override register(): void {
    if (!this.app.container.has(databaseManagerToken)) return;
    this.app.container.singleton(inAppNotificationStoreToken, (container) => {
      const store = createInAppStore(container.resolve(databaseManagerToken));
      if (!container.has(realtimeServiceToken)) return store;

      this.realtimeTopic = container
        .resolve(realtimeServiceToken)
        .defineTopic<InAppNotificationRealtimeEvent, 'user'>(
          IN_APP_NOTIFICATION_REALTIME_TOPIC,
          { audience: 'user' },
        );
      return createRealtimeInAppStore(store, this.realtimeTopic);
    });
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

  public override shutdown(): Promise<void> {
    this.realtimeTopic?.close();
    this.realtimeTopic = undefined;
    return Promise.resolve();
  }
}
