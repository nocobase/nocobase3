import type { NotificationExtensionRegistry } from '@nocobase/app-plugin-notification';

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

export function registerBuiltInNotificationProviders(
  registry: NotificationExtensionRegistry,
): void {
  registry
    .registerChannel(createEmailChannelDefinition())
    .registerProvider(createSmtpProviderDefinition())
    .registerProvider(createResendProviderDefinition())
    .registerChannel(createImChannelDefinition())
    .registerProvider(createFeishuWebhookProviderDefinition())
    .registerProvider(createDingTalkWebhookProviderDefinition());
}
