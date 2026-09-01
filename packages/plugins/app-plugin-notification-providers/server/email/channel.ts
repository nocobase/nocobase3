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
    test: {
      label: 'Email',
      fields: [
        {
          name: 'recipient',
          label: 'Recipient',
          type: 'email',
          required: true,
          placeholder: 'name@example.com',
          maxLength: 320,
        },
        {
          name: 'title',
          label: 'Title',
          type: 'text',
          required: true,
          defaultValue: 'NocoBase notification test',
          maxLength: 200,
        },
        {
          name: 'body',
          label: 'Message',
          type: 'textarea',
          required: true,
          defaultValue: 'This is a test notification from NocoBase.',
          maxLength: 2000,
        },
      ],
      toSendInput({ values }) {
        const address = values.recipient?.trim();
        if (!address || !isEmail(address)) {
          throw new Error('Recipient must be a valid email address.');
        }
        return {
          to: { type: 'email', address },
          content: requiredContent(values),
        };
      },
    },
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

function requiredContent(
  values: Readonly<Record<string, string>>,
): NotificationContent {
  const title = values.title?.trim();
  const body = values.body?.trim();
  if (!title || !body) throw new Error('Title and Message are required.');
  return { title, body };
}

function isEmail(value: string): boolean {
  return value.length <= 320 && /^[^\s@]+@[^\s@]+$/.test(value);
}
