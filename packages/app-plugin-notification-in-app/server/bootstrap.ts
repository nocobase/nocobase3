import type { AppPluginServerContext } from '@nocobase/app-server-kit/plugins';
import type { RealtimeService } from '@nocobase/app-server-kit/realtime';
import type { DatabaseManager } from '@nocobase/app-database';
import type { NotificationPluginServices } from '@nocobase/app-plugin-notification';

import {
  createDatabaseProviderDefinition,
  createInAppChannelDefinition,
} from './definition.js';
import {
  createRealtimeInAppStore,
  IN_APP_NOTIFICATION_REALTIME_TOPIC,
  type InAppNotificationRealtimeEvent,
} from './realtime.js';
import { createInAppStore, type InAppStore } from './store.js';

const stores = new WeakMap<object, InAppStore>();

export interface InAppNotificationPluginDeps {
  readonly database?: DatabaseManager;
}

export interface InAppNotificationPluginServices extends NotificationPluginServices {
  readonly realtime?: RealtimeService;
}

export type InAppNotificationPluginServerContext = AppPluginServerContext<
  InAppNotificationPluginDeps,
  InAppNotificationPluginServices
>;

export default function bootstrapInAppNotificationPlugin({
  deps,
  lifecycle,
  services,
}: InAppNotificationPluginServerContext): void {
  const notification = services.notification;
  if (!notification) return;
  if (!deps.database) {
    throw new Error(
      'In-app notifications require the application database dependency.',
    );
  }

  const realtimeTopic = services.realtime?.defineTopic<
    InAppNotificationRealtimeEvent,
    'user'
  >(IN_APP_NOTIFICATION_REALTIME_TOPIC, { audience: 'user' });
  if (realtimeTopic) {
    lifecycle.registerDisposer('realtime-topic', () => realtimeTopic.close());
  }

  const databaseStore = createInAppStore(deps.database);
  const store = realtimeTopic
    ? createRealtimeInAppStore(databaseStore, realtimeTopic)
    : databaseStore;
  notification.registry
    .registerChannel(createInAppChannelDefinition())
    .registerProvider('in-app', createDatabaseProviderDefinition({ store }));
  stores.set(notification, store);
}

export function getInAppNotificationStore(
  notification: object,
): InAppStore | undefined {
  return stores.get(notification);
}
