import type { NotificationChannelDefinition } from '@nocobase/notification';

import type {
  EmailChannelConfig,
  EmailMessage,
  EmailRecipient,
  PreparedEmailMessage,
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
): NotificationChannelDefinition<
  EmailChannelConfig,
  EmailRecipient,
  EmailMessage,
  PreparedEmailMessage
> {
  return {
    type: 'email',
    async createChannel() {
      return {
        type: 'email',
        async prepare(input: {
          readonly deliveryId: string;
          readonly notificationId: string;
          readonly recipient: EmailRecipient;
          readonly message: EmailMessage;
          readonly signal: AbortSignal;
        }): Promise<PreparedEmailMessage> {
          const address =
            input.recipient.address ??
            (input.recipient.userId
              ? await options.resolveUserEmail?.(input.recipient.userId)
              : undefined);
          if (!address)
            throw new Error('Email recipient address cannot be resolved.');
          if (!input.message.subject || !input.message.text)
            throw new Error('Email subject and text are required.');
          return { to: address, content: input.message };
        },
      };
    },
  };
}
