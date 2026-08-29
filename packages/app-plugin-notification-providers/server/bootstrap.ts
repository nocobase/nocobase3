import type {
  NotificationConfig,
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
  readonly app: {
    readonly publicBasePath: string;
  };
  readonly notification: NotificationConfig & {
    readonly test?: NotificationProviderTestConfig;
  };
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
