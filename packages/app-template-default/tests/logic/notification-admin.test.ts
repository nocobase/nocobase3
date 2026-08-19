// @vitest-environment node

import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import {
  createSessionManager,
  createSessionMiddleware,
  type AppSessionConfig,
  type SessionEnv,
} from "@nocobase/session";

import {
  createFakeEmailProvider,
  createEmailProviderRegistry,
} from "../../registry/notification/providers/index.ts";
import {
  createNotificationAdminRouter,
  listProviderSummaries,
  testProviderConnection,
} from "../../registry/notification/server/admin.ts";
import {
  createMemoryNotificationStore,
  type DeliveryRecord,
  type NotificationStatus,
} from "../../registry/notification/server/domain.ts";
import {
  getDeliveryDetail,
  listDeliverySummaries,
  retryDelivery,
} from "../../registry/notification/server/queries.ts";

describe("notification administration", () => {
  it("lists a redacted fixed-order ledger and exposes only content metadata", async () => {
    const store = createMemoryNotificationStore();
    await seedDelivery(
      store,
      delivery("delivery-1", "failed", "2026-08-19T01:00:00.000Z")
    );
    await seedDelivery(
      store,
      delivery("delivery-2", "submission_unknown", "2026-08-19T02:00:00.000Z")
    );

    const list = await listDeliverySummaries(store, {
      status: "submission_unknown",
      page: 1,
      pageSize: 25,
    });
    expect(list).toMatchObject({
      total: 1,
      data: [
        {
          id: "delivery-2",
          recipient: "s***@example.test",
          source: { type: "tests.admin" },
        },
      ],
    });
    const detail = await getDeliveryDetail(store, "delivery-2");
    expect(detail).toMatchObject({
      recipient: { email: "s***@example.test" },
      content: {
        fields: expect.arrayContaining(["subject", "text"]),
        byteLengths: { subject: 23, text: 26 },
      },
    });
    expect(JSON.stringify(detail)).not.toContain("secret@example.test");
    expect(JSON.stringify(detail)).not.toContain("password=hunter2");
  });

  it("uses CAS for ordinary and risky manual retries", async () => {
    const store = createMemoryNotificationStore();
    await seedDelivery(
      store,
      delivery("failed-1", "failed", "2026-08-19T01:00:00.000Z")
    );
    await seedDelivery(
      store,
      delivery("unknown-1", "submission_unknown", "2026-08-19T02:00:00.000Z")
    );

    const settled = await Promise.allSettled([
      retryDelivery(store, {
        deliveryId: "failed-1",
        expectedVersion: 1,
        reason: "operator retry",
        actor: "user:u1",
      }),
      retryDelivery(store, {
        deliveryId: "failed-1",
        expectedVersion: 1,
        reason: "operator retry",
        actor: "user:u1",
      }),
    ]);
    expect(
      settled.filter((result) => result.status === "fulfilled")
    ).toHaveLength(1);
    expect(
      settled.filter((result) => result.status === "rejected")[0]
    ).toMatchObject({
      reason: { code: "NOTIFICATION_DELIVERY_RETRY_CONFLICT", httpStatus: 409 },
    });
    await expect(
      retryDelivery(store, {
        deliveryId: "unknown-1",
        expectedVersion: 1,
        reason: "risky retry",
        actor: "user:u1",
      })
    ).rejects.toMatchObject({
      code: "NOTIFICATION_DUPLICATE_RISK_ACK_REQUIRED",
    });
    await expect(
      retryDelivery(store, {
        deliveryId: "unknown-1",
        expectedVersion: 1,
        reason: "risky retry",
        actor: "user:u1",
        acknowledgeDuplicateRisk: true,
      })
    ).resolves.toMatchObject({
      status: "queued",
      providerCursor: 0,
      currentAttempt: 0,
      lastError: undefined,
    });
  });

  it("projects providers without secrets and tests authenticated CSRF-protected mutations", async () => {
    const store = createMemoryNotificationStore();
    await seedDelivery(
      store,
      delivery("api-failed", "failed", "2026-08-19T01:00:00.000Z")
    );
    const provider = createFakeEmailProvider({
      instanceId: "email/fake/primary",
    });
    const providers = createEmailProviderRegistry([
      { id: provider.instanceId, enabled: true, provider },
    ]);
    const definitions = [
      { id: "email/fake/primary", type: "fake", enabled: true } as const,
      {
        id: "email/smtp/backup",
        type: "smtp",
        enabled: false,
        host: "smtp.example.test",
        port: 587,
        secure: false,
        usernameSecret: "SMTP_USER",
        passwordSecret: "SMTP_PASSWORD",
      } as const,
    ];
    expect(listProviderSummaries(definitions, providers)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "email/smtp/backup",
          active: false,
          secrets: [
            { reference: "SMTP_USER", configured: false },
            { reference: "SMTP_PASSWORD", configured: false },
          ],
        }),
      ])
    );
    await expect(
      testProviderConnection(providers, provider.instanceId)
    ).resolves.toMatchObject({ ok: true });
    expect(provider.messages).toEqual([]);

    const manager = createSessionManager(testSessionConfig());
    const dispatched: string[] = [];
    const app = new Hono<SessionEnv>();
    app.use("*", createSessionMiddleware(manager));
    app.get("/login", async (context) => {
      await context.var.session.update({ userId: "u1" });
      return context.json({ ok: true });
    });
    app.route(
      "/admin",
      createNotificationAdminRouter({
        store,
        providers,
        providerDefinitions: definitions,
        dispatchDelivery: async (deliveryId) => {
          dispatched.push(deliveryId);
        },
      })
    );

    await expect(
      (
        await app.request("http://localhost/admin/deliveries")
      ).status
    ).toBe(401);
    const login = await app.request("http://localhost/login");
    const sessionCookie = firstCookie(login);
    const listResponse = await app.request(
      "http://localhost/admin/deliveries?page=1&pageSize=25",
      { headers: { cookie: sessionCookie } }
    );
    expect(listResponse.status).toBe(200);
    await expect(listResponse.json()).resolves.toMatchObject({
      accessBoundary: expect.stringContaining("TEMPORARY"),
      total: 1,
    });
    expect(
      (
        await app.request("http://localhost/admin/deliveries?page=invalid", {
          headers: { cookie: sessionCookie },
        })
      ).status
    ).toBe(400);
    const noCsrf = await app.request(
      "http://localhost/admin/deliveries/api-failed/retry",
      {
        method: "POST",
        headers: { cookie: sessionCookie, "content-type": "application/json" },
        body: JSON.stringify({ expectedVersion: 1, reason: "operator retry" }),
      }
    );
    expect(noCsrf.status).toBe(403);

    const csrfResponse = await app.request("http://localhost/admin/csrf", {
      headers: { cookie: sessionCookie },
    });
    const csrf = (await csrfResponse.json()) as { token: string };
    const csrfCookie = firstCookie(csrfResponse);
    const retryResponse = await app.request(
      "http://localhost/admin/deliveries/api-failed/retry",
      {
        method: "POST",
        headers: {
          cookie: `${sessionCookie}; ${csrfCookie}`,
          origin: "http://localhost",
          "x-csrf-token": csrf.token,
          "content-type": "application/json",
        },
        body: JSON.stringify({ expectedVersion: 1, reason: "operator retry" }),
      }
    );
    expect(retryResponse.status).toBe(202);
    expect(dispatched).toEqual(["api-failed"]);
    await manager.dispose();
  });
});

function delivery(
  id: string,
  status: NotificationStatus,
  updatedAt: string
): DeliveryRecord {
  return {
    id,
    notificationId: `notification-${id}`,
    channel: "email",
    recipientKey: "email:secret@example.test",
    recipientSnapshot: { kind: "email", email: "secret@example.test" },
    recipientSchemaVersion: 1,
    contentSnapshot: {
      subject: "For secret@example.test",
      text: "password=hunter2 sensitive",
      messageId: `<${id}@notification.local>`,
    },
    contentSchemaVersion: 1,
    providerChainSnapshot: ["email/fake/primary"],
    providerChainSchemaVersion: 1,
    providerCursor: 0,
    currentAttempt: 0,
    status,
    statusChangedAt: updatedAt,
    lastError: {
      category: "network",
      code: "FAILED",
      message: "secret@example.test password=hunter2",
    },
    version: 1,
    createdAt: updatedAt,
    updatedAt,
  };
}

async function seedDelivery(
  store: ReturnType<typeof createMemoryNotificationStore>,
  record: DeliveryRecord
): Promise<void> {
  await store.createNotificationBundle({
    notification: {
      id: record.notificationId,
      sourceType: "tests.admin",
      sourceReferenceId: record.id,
      principalService: "tests",
      triggeredAt: record.createdAt,
      messageMode: "direct",
      summaryStatus: "failed",
      version: 1,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    },
    deliveries: [record],
    statusEvents: [
      {
        id: `event-${record.id}`,
        deliveryId: record.id,
        sequence: 1,
        toStatus: record.status,
        occurredAt: record.createdAt,
        metadataSchemaVersion: 1,
      },
    ],
  });
}

function testSessionConfig(): AppSessionConfig {
  return {
    enabled: true,
    default: "memory",
    stores: { memory: { driver: "memory", base: "tests:notification-admin:" } },
    cookie: {
      name: "nocobase_session",
      path: "/",
      httpOnly: true,
      sameSite: "lax",
    },
    lifetime: { absolute: "2h" },
    secret: "notification-admin-test-secret",
    gcLottery: [0, 100],
  };
}

function firstCookie(response: Response): string {
  return response.headers.get("set-cookie")?.split(";")[0] ?? "";
}
