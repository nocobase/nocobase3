import type { AppPluginServerContext } from '@nocobase/app-server-kit/plugins';
import type {
  NotificationChannelDefinition,
  NotificationProviderDefinition,
} from '@nocobase/app-plugin-notification';
import type { Hono } from 'hono';

import {
  createDatabaseProviderDefinition,
  createInAppChannelDefinition,
} from './definition.js';
import { createInAppRouter, type InAppUserIdResolver } from './router.js';
import type { InAppStore } from './store.js';
import { createInAppTestRouter, type InAppTestSender } from './test-router.js';

interface NotificationPluginDependencies {
  readonly resolveRequestUserId: InAppUserIdResolver;
}

interface NotificationRegistrar {
  registerChannel(
    definition: NotificationChannelDefinition,
  ): NotificationRegistrar;
  registerProvider(
    channelType: string,
    definition: NotificationProviderDefinition,
  ): NotificationRegistrar;
}

interface NotificationPluginServices {
  readonly notification?: InAppTestSender & {
    readonly registry: NotificationRegistrar;
    readonly router: Hono;
  };
  readonly notificationInAppStore?: InAppStore;
}

type NotificationPluginContext = AppPluginServerContext<
  NotificationPluginDependencies,
  NotificationPluginServices
>;

export default function bootstrap({
  deps,
  services,
}: NotificationPluginContext): void {
  const notification = services.notification;
  const store = services.notificationInAppStore;
  if (!notification || !store) return;

  notification.registry
    .registerChannel(createInAppChannelDefinition())
    .registerProvider('in-app', createDatabaseProviderDefinition({ store }));
  notification.router.route(
    '/in-app',
    createInAppRouter(store, { resolveUserId: deps.resolveRequestUserId }),
  );
  notification.router.route('/test', createInAppTestRouter(notification));
}
