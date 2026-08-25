import type {
  NotificationProviderContext,
  NotificationChannelDefinition,
  NotificationProviderDefinition,
} from '@nocobase/notification';
import { createInAppStore, type InAppStore } from './store.js';
import { createInAppRouter } from './router.js';
import type { InAppUserIdResolver } from './router.js';
import type { InAppMessage, InAppRecipient } from './types.js';

const stores = new WeakMap<object, InAppStore>();

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

export interface CreateInAppChannelDefinitionOptions {
  readonly resolveUserId?: InAppUserIdResolver;
}

export function defineInAppChannelConfig(
  input: Omit<InAppChannelConfig, 'type'>,
): InAppChannelConfig {
  return { type: 'in-app', ...input };
}

export function createInAppChannelDefinition(
  options: CreateInAppChannelDefinitionOptions = {},
): NotificationChannelDefinition<
  InAppChannelConfig,
  InAppRecipient,
  InAppMessage,
  PreparedInAppMessage
> {
  let store: InAppStore | undefined;
  return {
    type: 'in-app',
    async createChannel(context) {
      store ??= resolveInAppStore(context);
      return {
        type: 'in-app',
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
        mount(router): void {
          router.route('/in-app', createInAppRouter(store!, options));
        },
      };
    },
  };
}

export function createDatabaseProviderDefinition(): NotificationProviderDefinition<
  InAppProviderConfig,
  PreparedInAppMessage
> {
  return {
    type: 'database',
    async createProvider(context, config) {
      const store = resolveInAppStore(context);
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
              createdAt: await context.store.now(),
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

function resolveInAppStore(context: NotificationProviderContext): InAppStore {
  const existing = stores.get(context.store);
  if (existing) return existing;
  const store = createInAppStore(context.database);
  stores.set(context.store, store);
  return store;
}
