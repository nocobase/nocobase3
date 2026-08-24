import type { NotificationChannelDefinition } from '@nocobase/notification';

import type {
  EmailChannelConfig,
  EmailMessage,
  EmailRecipient,
} from './types.js';

export interface EmailChannelDefinitionOptions {
  readonly resolveUserEmail?: (userId: string) => Promise<string | undefined>;
}

export function defineEmailChannelConfig(
  input: Omit<EmailChannelConfig, 'type'>,
): EmailChannelConfig {
  return { type: 'email', ...input };
}

export function createEmailChannelDefinition(
  options: EmailChannelDefinitionOptions = {},
): NotificationChannelDefinition<EmailChannelConfig> {
  return {
    type: 'email',
    async createChannel() {
      return {
        type: 'email',
        async prepare(input: {
          readonly deliveryId: string;
          readonly notificationId: string;
          readonly recipient: object;
          readonly message: object;
        }): Promise<object> {
          const recipient = input.recipient as EmailRecipient;
          const message = input.message as EmailMessage;
          const address =
            recipient.address ??
            (recipient.userId
              ? await options.resolveUserEmail?.(recipient.userId)
              : undefined);
          if (!address)
            throw new Error('Email recipient address cannot be resolved.');
          if (!message.subject || !message.text)
            throw new Error('Email subject and text are required.');
          return { to: address, content: message };
        },
      };
    },
  };
}
