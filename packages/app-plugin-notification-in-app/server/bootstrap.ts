import type { AppPluginServerContext } from '@nocobase/app-server-kit/plugins';
import type { DatabaseManager } from '@nocobase/app-database';
import type { NotificationPluginServices } from '@nocobase/app-plugin-notification';

import {
  createDatabaseProviderDefinition,
  createInAppChannelDefinition,
} from './definition.js';
import { createInAppStore, type InAppStore } from './store.js';

const stores = new WeakMap<object, InAppStore>();

export interface InAppNotificationPluginDeps {
  readonly database?: DatabaseManager;
}

export type InAppNotificationPluginServerContext = AppPluginServerContext<
  InAppNotificationPluginDeps,
  NotificationPluginServices
>;

export default function bootstrapInAppNotificationPlugin({
  deps,
  services,
}: InAppNotificationPluginServerContext): void {
  const notification = services.notification;
  if (!notification) return;
  if (!deps.database) {
    throw new Error(
      'In-app notifications require the application database dependency.',
    );
  }

  const store = createInAppStore(deps.database);
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
