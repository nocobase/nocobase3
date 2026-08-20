import type { Logger } from "@nocobase/logging";

import type { PortalLivePublisher } from "../../portal-live/server/index.js";
import type { NotificationStore } from "./domain.js";

export interface NotificationLiveTarget {
  readonly publisher: PortalLivePublisher;
  readonly appId: string;
}

export type InboxLiveEventType =
  "created" | "updated" | "deleted" | "unread-count-changed";

export function createLivePublishingNotificationStore(
  store: NotificationStore,
  live: NotificationLiveTarget,
  logger: Logger,
): NotificationStore {
  const publish = (
    userId: string,
    type: InboxLiveEventType,
    ids?: readonly string[],
  ): void => {
    try {
      live.publisher.publish({
        appId: live.appId,
        userId,
        channel: "notifications/inbox",
        type,
        payload: ids ? { ids } : {},
      });
    } catch (error) {
      logger.warn(
        { error },
        "Failed to publish a Portal Live inbox event; HTTP reconciliation will converge.",
      );
    }
  };

  return {
    ...store,
    async transitionDelivery(input) {
      const result = await store.transitionDelivery(input);
      if (
        !result ||
        (result.status !== "delivered" && result.status !== "accepted")
      )
        return result;
      const items = await store.listUserNotificationItemsByDelivery(result.id);
      for (const userId of new Set(items.map((item) => item.userId))) {
        publish(
          userId,
          "created",
          items.filter((item) => item.userId === userId).map((item) => item.id),
        );
      }
      return result;
    },
    async updateInboxItem(input) {
      const result = await store.updateInboxItem(input);
      if (!result || result.version === input.expectedVersion) return result;
      if (input.action === "delete") {
        publish(input.userId, "deleted", [input.itemId]);
      } else {
        publish(input.userId, "updated", [input.itemId]);
      }
      publish(input.userId, "unread-count-changed");
      return result;
    },
    async markInboxRead(input) {
      const updated = await store.markInboxRead(input);
      if (updated > 0) publish(input.userId, "unread-count-changed");
      return updated;
    },
  };
}
