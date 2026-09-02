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
    .registerProvider('email', createSmtpProviderDefinition())
    .registerProvider('email', createResendProviderDefinition())
    .registerChannel(createImChannelDefinition())
    .registerProvider('im', createFeishuWebhookProviderDefinition())
    .registerProvider('im', createDingTalkWebhookProviderDefinition());
}
