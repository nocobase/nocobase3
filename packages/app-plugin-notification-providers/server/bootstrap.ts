import type { AppPluginServerContext } from '@nocobase/app-server-kit/plugins';
import type {
  NotificationChannelDefinition,
  NotificationProviderDefinition,
} from '@nocobase/app-plugin-notification';
import type { Hono } from 'hono';

import {
  createEmailChannelDefinition,
  createSmtpProviderDefinition,
} from './email/index.js';
import {
  createEmailTestRouter,
  type EmailTestSender,
} from './email/test-router.js';

interface NotificationRegistrar {
  registerChannel(
    definition: NotificationChannelDefinition,
  ): NotificationRegistrar;
  registerProvider(
    channelType: string,
    definition: NotificationProviderDefinition,
  ): NotificationRegistrar;
}

interface NotificationProviderPluginServices {
  readonly notification?: EmailTestSender & { readonly router: Hono };
  readonly notificationRegistry?: NotificationRegistrar;
}

type NotificationProviderPluginContext = AppPluginServerContext<
  unknown,
  NotificationProviderPluginServices
>;

export default function bootstrap({
  services,
}: NotificationProviderPluginContext): void {
  const notification = services.notification;
  if (notification) {
    notification.router.route('/test', createEmailTestRouter(notification));
  }
  services.notificationRegistry
    ?.registerChannel(createEmailChannelDefinition())
    .registerProvider('email', createSmtpProviderDefinition());
}
