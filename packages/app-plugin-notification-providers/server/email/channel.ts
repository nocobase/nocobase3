import type {
  NotificationChannelDefinition,
  NotificationContent,
  NotificationProviderIdentity,
  NotificationRecipient,
} from '@nocobase/app-plugin-notification';

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
        resolveRecipient(input: {
          readonly recipient: NotificationRecipient;
          readonly provider: NotificationProviderIdentity;
        }): EmailRecipient | undefined {
          const { recipient } = input;
          if (recipient.type === 'user') return { userId: recipient.id };
          if (recipient.type === 'email') return { address: recipient.address };
          return undefined;
        },
        render(input: {
          readonly content: NotificationContent;
          readonly override?: Partial<EmailMessage>;
        }): EmailMessage {
          return {
            subject: input.content.title ?? input.content.body,
            text: input.content.body,
            ...input.override,
          };
        },
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
