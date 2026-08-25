import type { AppPluginServerContext } from '@nocobase/app-server-kit/plugins';
import type {
  NotificationChannelDefinition,
  NotificationProviderDefinition,
} from '@nocobase/app-plugin-notification';
import type { Hono } from 'hono';

import {
  createDatabaseProviderDefinition,
  createInAppChannelDefinition,
} from './index.js';
import type { InAppUserIdResolver } from './router.js';
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
  readonly notification?: InAppTestSender & { readonly router: Hono };
  readonly notificationRegistry?: NotificationRegistrar;
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
  if (notification) {
    notification.router.route('/test', createInAppTestRouter(notification));
  }
  services.notificationRegistry
    ?.registerChannel(
      createInAppChannelDefinition({
        resolveUserId: deps.resolveRequestUserId,
      }),
    )
    .registerProvider('in-app', createDatabaseProviderDefinition());
}
