import type {
  NotificationContent,
  NotificationChannelDefinition,
  NotificationProviderDefinition,
  NotificationRecipient,
} from '@nocobase/app-plugin-notification';
import type { InAppStore } from './store.js';
import type { InAppMessage, InAppRecipient } from './types.js';

export interface InAppProviderConfig {
  readonly type: 'database';
  readonly name: string;
  readonly enabled?: boolean;
}
export interface InAppChannelConfig {
  readonly type: 'in-app';
  readonly enabled: boolean;
  readonly providers: readonly InAppProviderConfig[];
}

export interface PreparedInAppMessage {
  readonly deliveryId: string;
  readonly notificationId: string;
  readonly recipient: InAppRecipient;
  readonly content: InAppMessage;
}

export function defineInAppChannelConfig(
  input: Omit<InAppChannelConfig, 'type'>,
): InAppChannelConfig {
  return { type: 'in-app', ...input };
}

export function createInAppChannelDefinition(): NotificationChannelDefinition<
  InAppChannelConfig,
  InAppRecipient,
  InAppMessage,
  PreparedInAppMessage
> {
  return {
    type: 'in-app',
    async createChannel() {
      return {
        type: 'in-app',
        resolveRecipient(input: {
          readonly recipient: NotificationRecipient;
        }): InAppRecipient | undefined {
          const { recipient } = input;
          return recipient.type === 'user'
            ? { userId: recipient.id }
            : undefined;
        },
        render(input: {
          readonly content: NotificationContent;
          readonly override?: Partial<InAppMessage>;
        }): InAppMessage {
          return {
            title: input.content.title,
            body: input.content.body,
            actionUrl: input.content.actionUrl,
            ...input.override,
          };
        },
        async prepare(input: {
          readonly deliveryId: string;
          readonly notificationId: string;
          readonly recipient: InAppRecipient;
          readonly message: InAppMessage;
          readonly signal: AbortSignal;
        }): Promise<PreparedInAppMessage> {
          if (!input.recipient.userId)
            throw new Error('In-app recipient userId is required.');
          return {
            deliveryId: input.deliveryId,
            notificationId: input.notificationId,
            recipient: input.recipient,
            content: input.message,
          };
        },
      };
    },
  };
}

export function createDatabaseProviderDefinition(options: {
  readonly store: InAppStore;
}): NotificationProviderDefinition<InAppProviderConfig, PreparedInAppMessage> {
  return {
    type: 'database',
    async createProvider(context, config) {
      const { store } = options;
      return {
        name: config.name,
        type: 'database',
        async send({ message }) {
          try {
            await store.deliver({
              deliveryId: message.deliveryId,
              notificationId: message.notificationId,
              userId: message.recipient.userId,
              message: message.content,
              createdAt: await context.now(),
            });
            return { status: 'accepted' };
          } catch (error) {
            return {
              status: 'failed',
              disposition: 'same_provider',
              error: {
                category: 'storage',
                message: error instanceof Error ? error.message : String(error),
              },
            };
          }
        },
      };
    },
  };
}
