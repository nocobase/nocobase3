import type { AppPluginServerContext } from '@nocobase/app-server-kit/plugins';
import type {
  NotificationConfig,
  NotificationPluginServices,
  NotificationService,
} from '@nocobase/app-plugin-notification';

import {
  createEmailChannelDefinition,
  createResendProviderDefinition,
  createSmtpProviderDefinition,
} from './email/index.js';
import {
  createDingTalkWebhookProviderDefinition,
  createFeishuWebhookProviderDefinition,
  createImChannelDefinition,
} from './im/index.js';

export interface NotificationProviderTestConfig {
  readonly enabled: boolean;
  readonly emailRecipient?: string;
}

export interface NotificationProvidersPluginConfig {
  readonly notification: NotificationConfig & {
    readonly test?: NotificationProviderTestConfig;
  };
}

export type NotificationProvidersPluginServerContext = AppPluginServerContext<
  unknown,
  NotificationPluginServices,
  NotificationProvidersPluginConfig
>;

export default function bootstrapNotificationProviders({
  services,
}: NotificationProvidersPluginServerContext): void {
  registerBuiltInNotificationProviders(services.notification);
}

export function registerBuiltInNotificationProviders(
  notification: Pick<NotificationService, 'registry'> | undefined,
): void {
  if (!notification) return;

  notification.registry
    .registerChannel(createEmailChannelDefinition())
    .registerProvider('email', createSmtpProviderDefinition())
    .registerProvider('email', createResendProviderDefinition())
    .registerChannel(createImChannelDefinition())
    .registerProvider('im', createFeishuWebhookProviderDefinition())
    .registerProvider('im', createDingTalkWebhookProviderDefinition());
}
