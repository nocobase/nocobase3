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
  readonly resolveUserEmail?: (
    userId: string,
    provider: NotificationProviderIdentity,
  ) => Promise<string | undefined>;
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
        async resolveRecipient(input: {
          readonly recipient: NotificationRecipient;
          readonly provider: NotificationProviderIdentity;
        }): Promise<EmailRecipient | undefined> {
          const { recipient } = input;
          if (recipient.type === 'user') {
            const address = await options.resolveUserEmail?.(
              recipient.id,
              input.provider,
            );
            return address ? { address } : undefined;
          }
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
          if (!input.message.subject || !input.message.text)
            throw new Error('Email subject and text are required.');
          return { to: input.recipient.address, content: input.message };
        },
      };
    },
  };
}
