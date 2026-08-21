import { createLogger } from "@nocobase/logging";
import { describe, expect, it, vi } from "vitest";

import { ChannelManager } from "../src/channel-manager.js";
import {
  createMemoryNotificationStore,
  type NotificationDeliveryRecord,
  type NotificationLogRecord,
} from "../src/store.js";

describe("ChannelManager", () => {
  it("tries Providers in configured order without retrying one Provider", async () => {
    const store = createMemoryNotificationStore();
    const delivery = await seed(store);
    const first = vi.fn(
      async () =>
        ({
          status: "failed",
          error: { message: "primary unavailable" },
          allowNextProvider: true,
        }) as const,
    );
    const second = vi.fn(
      async () =>
        ({ status: "accepted", providerMessageId: "remote-1" }) as const,
    );
    const manager = new ChannelManager({
      logger: createLogger({ level: "silent" }),
      store,
    });
    manager.register("email", {
      channel: {
        type: "email",
        async prepare(input): Promise<object> {
          return input.message;
        },
      },
      providers: [
        { name: "primary", type: "fake", send: first },
        { name: "secondary", type: "fake", send: second },
      ],
    });

    const result = await manager.send(delivery.id);

    expect(result?.status).toBe("sent");
    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
    expect(await store.listAttempts(delivery.id)).toHaveLength(2);
  });

  it("stops fallback when submission result is unknown", async () => {
    const store = createMemoryNotificationStore();
    const delivery = await seed(store);
    const next = vi.fn(async () => ({ status: "accepted" }) as const);
    const manager = new ChannelManager({
      logger: createLogger({ level: "silent" }),
      store,
    });
    manager.register("email", {
      channel: {
        type: "email",
        async prepare(input): Promise<object> {
          return input.message;
        },
      },
      providers: [
        {
          name: "primary",
          type: "fake",
          async send() {
            return {
              status: "submission_unknown",
              error: { message: "connection closed after submit" },
            };
          },
        },
        { name: "secondary", type: "fake", send: next },
      ],
    });

    expect((await manager.send(delivery.id))?.status).toBe("unknown");
    expect(next).not.toHaveBeenCalled();
  });
});

async function seed(
  store: ReturnType<typeof createMemoryNotificationStore>,
): Promise<NotificationDeliveryRecord> {
  const now = await store.now();
  const log: NotificationLogRecord = {
    id: "notification-1",
    sourceType: "test",
    messageSnapshot: { email: { subject: "Hello" } },
    status: "pending",
    createdAt: now,
    updatedAt: now,
  };
  const delivery: NotificationDeliveryRecord = {
    id: crypto.randomUUID(),
    notificationId: log.id,
    channel: "email",
    recipientKey: "user-1",
    recipientSnapshot: { address: "test@example.com" },
    messageSnapshot: { subject: "Hello" },
    providerChain: ["primary", "secondary"],
    providerCursor: 0,
    attemptCount: 0,
    status: "pending",
    createdAt: now,
    updatedAt: now,
    version: 1,
  };
  await store.create({ log, deliveries: [delivery] });
  return delivery;
}
