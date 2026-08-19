// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import { createLoggerManager, createSilentLoggerConfig } from "@nocobase/logger";
import type { NocoBaseQueueManager } from "@nocobase/queue";

import {
  createMemoryNotificationStore,
  type DeliveryRecord,
  type NotificationRecord,
} from "../../registry/notification/server/domain.ts";
import {
  createNotificationModule,
  type NotificationCloseResult,
} from "../../registry/notification/server/index.ts";
import { reconcileNotificationDeliveries } from "../../registry/notification/server/reconciler.ts";
import {
  createEmailProviderRegistry,
  createFakeEmailProvider,
} from "../../registry/notification/providers/index.ts";

describe("notification reconciler and shutdown", () => {
  it("recovers safe work, quarantines invoked work, and republishes only queued deliveries", async () => {
    const store = createMemoryNotificationStore();
    await seed(store, "queued", "queued");
    await seed(store, "safe", "queued");
    await seed(store, "invoked", "queued");
    await store.claimDelivery(claim("safe", "attempt-safe", false));
    await store.claimDelivery(claim("invoked", "attempt-invoked", true));
    const dispatched: string[] = [];

    const result = await reconcileNotificationDeliveries({
      store,
      now: () => new Date("2026-08-20T00:00:02.000Z"),
      dispatchDelivery: async (deliveryId) => {
        dispatched.push(deliveryId);
      },
    });

    expect(result).toEqual({
      recoveredQueued: 1,
      recoveredUnknown: 1,
      dispatched: 2,
      dispatchFailures: 0,
    });
    expect(dispatched.sort()).toEqual(["queued", "safe"]);
    await expect(store.getDelivery("invoked")).resolves.toMatchObject({
      status: "submission_unknown",
    });
  });

  it("leaves persisted queued truth retryable when queue publication fails", async () => {
    const store = createMemoryNotificationStore();
    await seed(store, "queued", "queued");
    const first = await reconcileNotificationDeliveries({
      store,
      now: () => new Date("2026-08-20T00:00:02.000Z"),
      dispatchDelivery: async () => {
        throw new Error("queue unavailable");
      },
    });
    expect(first.dispatchFailures).toBe(1);
    await expect(store.getDelivery("queued")).resolves.toMatchObject({
      status: "queued",
    });
    const dispatched: string[] = [];
    await reconcileNotificationDeliveries({
      store,
      now: () => new Date("2026-08-20T00:00:03.000Z"),
      dispatchDelivery: async (deliveryId) => {
        dispatched.push(deliveryId);
      },
    });
    expect(dispatched).toEqual(["queued"]);
  });

  it("runs reconciliation when the notification module starts", async () => {
    const queueManager = queueStub();
    const loggerManager = createLoggerManager(createSilentLoggerConfig());
    const module = createNotificationModule({
      allowNonPersistentStore: true,
      queueManager,
      logger: loggerManager.use(),
      reconcileIntervalMs: 60_000,
    });
    await seed(module.service.store, "startup-due", "queued");

    await module.start();

    expect(queueManager.dispatch).toHaveBeenCalledWith(
      expect.any(Function),
      { deliveryId: "startup-due" }
    );
    module.beginShutdown();
    await queueManager.close();
    await module.close({ deadlineAt: Date.now() + 1_000 });
    await loggerManager.flushAll();
  });

  it("honors the close deadline when a Provider cannot close", async () => {
    const queueManager = queueStub();
    const loggerManager = createLoggerManager(createSilentLoggerConfig());
    const provider = createFakeEmailProvider({ instanceId: "email/fake/slow" });
    vi.spyOn(provider, "close").mockImplementation(
      async () => new Promise<void>(() => undefined)
    );
    const module = createNotificationModule({
      allowNonPersistentStore: true,
      queueManager,
      logger: loggerManager.use(),
      emailProviders: createEmailProviderRegistry([
        { id: provider.instanceId, enabled: true, provider },
      ]),
    });

    const result: NotificationCloseResult = await module.close({
      deadlineAt: Date.now() + 20,
    });
    expect(result.errors).toEqual([
      "provider:email/fake/slow: shutdown deadline exceeded",
    ]);
    await loggerManager.flushAll();
  });
});

async function seed(
  store: ReturnType<typeof createMemoryNotificationStore>,
  id: string,
  status: DeliveryRecord["status"]
): Promise<void> {
  const time = "2026-08-20T00:00:00.000Z";
  const notification: NotificationRecord = {
    id: `notification-${id}`,
    sourceType: "tests.reconciler",
    principalService: "tests",
    triggeredAt: time,
    messageMode: "direct",
    summaryStatus: "queued",
    version: 1,
    createdAt: time,
    updatedAt: time,
  };
  const delivery: DeliveryRecord = {
    id,
    notificationId: notification.id,
    channel: "email",
    recipientKey: `email:${id}@example.test`,
    recipientSnapshot: { kind: "email", email: `${id}@example.test` },
    recipientSchemaVersion: 1,
    contentSnapshot: { subject: "Test", text: "Test" },
    contentSchemaVersion: 1,
    providerChainSnapshot: ["email/fake/primary"],
    providerChainSchemaVersion: 1,
    providerCursor: 0,
    currentAttempt: 0,
    status,
    statusChangedAt: time,
    version: 1,
    createdAt: time,
    updatedAt: time,
  };
  await store.createNotificationBundle({ notification, deliveries: [delivery] });
}

function claim(
  deliveryId: string,
  attemptId: string,
  invoked: boolean
): Parameters<ReturnType<typeof createMemoryNotificationStore>["claimDelivery"]>[0] {
  const time = "2026-08-20T00:00:00.000Z";
  return {
    deliveryId,
    expectedVersion: 1,
    leaseToken: `lease-${deliveryId}`,
    leaseOwner: "worker",
    leaseExpiresAt: "2026-08-20T00:00:01.000Z",
    claimedAt: time,
    attempt: {
      id: attemptId,
      deliveryId,
      attemptSequence: 1,
      providerInstance: "email/fake/primary",
      providerType: "fake",
      status: "sending",
      startedAt: time,
      invocationStartedAt: invoked ? time : undefined,
      metadataSchemaVersion: 1,
      createdAt: time,
      updatedAt: time,
    },
  };
}

function queueStub(): NocoBaseQueueManager {
  return {
    init: vi.fn(async (): Promise<void> => undefined),
    use: vi.fn(),
    registerJob: vi.fn(),
    dispatch: vi.fn(),
    dispatchMany: vi.fn(),
    createWorker: vi.fn(),
    close: vi.fn(async (): Promise<void> => undefined),
  };
}
