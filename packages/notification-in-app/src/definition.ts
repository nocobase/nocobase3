import type { NotificationChannelDefinition } from "@nocobase/notification";
import { createInAppStore, type InAppStore } from "./store.js";
import { createInAppRouter } from "./router.js";
import type { InAppMessage, InAppRecipient } from "./types.js";

export interface InAppProviderConfig {
  readonly type: "database";
  readonly name: string;
  readonly enabled?: boolean;
}
export interface InAppChannelConfig {
  readonly type: "in-app";
  readonly enabled: boolean;
  readonly providers: readonly InAppProviderConfig[];
}

export function defineInAppChannelConfig(
  input: Omit<InAppChannelConfig, "type">,
): InAppChannelConfig {
  return { type: "in-app", ...input };
}

export function createInAppChannelDefinition(): NotificationChannelDefinition<InAppChannelConfig> {
  let store: InAppStore | undefined;
  return {
    type: "in-app",
    providerDefinitions: [
      {
        type: "database",
        async createProvider(context, config) {
          store ??= createInAppStore(context.database);
          const activeStore = store;
          return {
            name: config.name,
            type: "database",
            async send(message: object) {
              const value = message as {
                readonly deliveryId: string;
                readonly notificationId: string;
                readonly recipient: InAppRecipient;
                readonly content: InAppMessage;
              };
              await activeStore.deliver({
                deliveryId: value.deliveryId,
                notificationId: value.notificationId,
                userId: value.recipient.userId,
                message: value.content,
                createdAt: await context.store.now(),
              });
              return { status: "accepted" };
            },
          };
        },
      },
    ],
    async createChannel(context) {
      store ??= createInAppStore(context.database);
      return {
        type: "in-app",
        async prepare(input: {
          readonly deliveryId: string;
          readonly notificationId: string;
          readonly recipient: InAppRecipient;
          readonly message: InAppMessage;
        }): Promise<object> {
          if (!input.recipient.userId)
            throw new Error("In-app recipient userId is required.");
          return {
            deliveryId: input.deliveryId,
            notificationId: input.notificationId,
            recipient: input.recipient,
            content: input.message,
          };
        },
        mount(router): void {
          router.route("/in-app", createInAppRouter(store!));
        },
      };
    },
  };
}
