import { Migrator } from "kysely";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFilesModule, FilesMigrationProvider, type StorageDriver } from "../../src/index.ts";
import { createTestDatabase } from "../persistence/test-database.ts";

describe("Files maintenance service", () => {
  let db: ReturnType<typeof createTestDatabase>;
  let now: Date;
  let deleted: string[];
  let failDelete: boolean;
  let ids: number;
  let module: ReturnType<typeof createFilesModule>;

  beforeEach(async () => {
    db = createTestDatabase();
    await new Migrator({ db, provider: new FilesMigrationProvider() }).migrateToLatest();
    now = new Date("2026-08-18T00:10:00.000Z");
    deleted = [];
    failDelete = false;
    ids = 0;
    const driver: StorageDriver = {
      type: "local",
      capabilities: () => ({ uploadModes: ["proxy"], externalReadTarget: false }),
      prepareUpload: async () => ({ mode: "proxy" }),
      statObject: async () => null,
      deleteObject: async ({ key }) => { deleted.push(key); if (failDelete) throw new Error("private provider failure"); },
    };
    module = createFilesModule({
      db,
      config: { defaultPolicy: "default", backends: { local: { driver: "local", root: ".", signingSecret: "s".repeat(32) } }, policies: { default: { backend: "local", description: "Default", maxSize: 100, allowedContentTypes: ["*/*"], uploadUrlTtlSeconds: 60, defaultReadUrlTtlSeconds: 60, maxReadUrlTtlSeconds: 120 } } },
      drivers: { local: driver }, requestContext: { getActor: () => ({ id: "actor" }), getWorkspaceId: () => "workspace" }, authorizer: { authorize: async () => undefined }, now: () => now, generateId: () => `id-${++ids}`,
    });
  });

  afterEach(async () => db.destroy());

  async function pending(suffix: string, expiresAt = new Date(now.getTime() - 1)) {
    return module.store.createPendingUpload({
      file: { id: `file-${suffix}`, workspaceId: "workspace", backendKey: "local", policy: "default", storageKey: `w/workspace/objects/${suffix}`, originalName: `${suffix}.txt`, contentType: "text/plain", size: 1, createdBy: "actor" },
      upload: { id: `upload-${suffix}`, idempotencyKey: `key-${suffix}`, requestFingerprint: `fp-${suffix}`, expiresAt },
    });
  }

  it("expires missing or uploaded objects, respects limits, and is idempotent", async () => {
    await pending("one"); await pending("two"); await pending("three");
    expect(await module.maintenance.expireUploads({ limit: 2 })).toEqual({ scanned: 2, succeeded: 2, retried: 0, failed: 0, skipped: 0 });
    expect(await module.maintenance.expireUploads({ limit: 2 })).toEqual({ scanned: 1, succeeded: 1, retried: 0, failed: 0, skipped: 0 });
    expect(await module.maintenance.expireUploads()).toEqual({ scanned: 0, succeeded: 0, retried: 0, failed: 0, skipped: 0 });
    expect(new Set(deleted).size).toBe(3);
    expect((await module.store.getUpload("workspace", "upload-one"))?.status).toBe("expired");
    expect((await module.store.getFile("workspace", "file-one"))?.status).toBe("failed");
  });

  it("releases transient failures for retry without logging provider details", async () => {
    await pending("retry");
    const logger = vi.fn();
    const service = createFilesModule({ db, config: { defaultPolicy: "default", backends: { local: { driver: "local", root: ".", signingSecret: "s".repeat(32) } }, policies: { default: { backend: "local", description: "Default", maxSize: 100, allowedContentTypes: ["*/*"], uploadUrlTtlSeconds: 60, defaultReadUrlTtlSeconds: 60, maxReadUrlTtlSeconds: 120 } } }, drivers: { local: { type: "local", capabilities: () => ({ uploadModes: ["proxy"], externalReadTarget: false }), prepareUpload: async () => ({ mode: "proxy" }), statObject: async () => null, deleteObject: async () => { if (failDelete) throw new Error("signed-url-secret"); } } }, requestContext: { getActor: () => ({ id: "actor" }), getWorkspaceId: () => "workspace" }, authorizer: { authorize: async () => undefined }, now: () => now, logger: { error: logger } }).maintenance;
    failDelete = true;
    expect(await service.expireUploads()).toMatchObject({ retried: 1, succeeded: 0 });
    expect((await module.store.getUpload("workspace", "upload-retry"))?.cleanupStatus).toBe("pending");
    expect(JSON.stringify(logger.mock.calls)).not.toContain("signed-url-secret");
    failDelete = false;
    expect(await service.expireUploads()).toMatchObject({ succeeded: 1, retried: 0 });
  });

  it("uses CAS so two workers cannot claim the same upload and never selects a ready file", async () => {
    await pending("race");
    const [a, b] = await Promise.all([module.store.listExpiredPendingUploads(now, 10), module.store.listExpiredPendingUploads(now, 10)]);
    const first = await module.store.claimExpiredUpload(a[0].workspaceId, a[0].id, now);
    const second = await module.store.claimExpiredUpload(b[0].workspaceId, b[0].id, now);
    expect(first).toBeDefined();
    expect(second).toBeUndefined();
    await module.store.releaseExpiredUploadClaim("workspace", "upload-race");
    expect(await module.maintenance.expireUploads()).toMatchObject({ succeeded: 1 });
    expect(deleted).toHaveLength(1);
    const ready = await pending("ready");
    await module.store.completeUpload("workspace", ready.upload.id, { contentType: "text/plain", size: 1 });
    expect(await module.maintenance.expireUploads()).toMatchObject({ scanned: 0, succeeded: 0 });
    expect((await module.store.getFile("workspace", ready.file.id))?.status).toBe("ready");
  });

  it("retries exact pending physical deletes, treats not found as success, and skips ready files", async () => {
    const ready = await pending("deleted", new Date(now.getTime() + 60_000));
    await module.store.completeUpload("workspace", ready.upload.id, { contentType: "text/plain", size: 1 });
    expect(await module.maintenance.deletePendingObjects()).toMatchObject({ scanned: 0 });
    await module.store.markFileDeleted("workspace", ready.file.id, "actor", now);
    failDelete = true;
    expect(await module.maintenance.deletePendingObjects()).toMatchObject({ retried: 1, succeeded: 0 });
    failDelete = false;
    expect(await module.maintenance.deletePendingObjects()).toEqual({ scanned: 1, succeeded: 1, retried: 0, failed: 0, skipped: 0 });
    expect(await module.maintenance.deletePendingObjects()).toMatchObject({ scanned: 0, succeeded: 0 });
    expect((await module.store.getFile("workspace", ready.file.id, { includeDeleted: true }))?.storageDeleteStatus).toBe("completed");
  });

  it("uses CAS so physical deletion has one owner", async () => {
    const ready = await pending("delete-race", new Date(now.getTime() + 60_000));
    await module.store.completeUpload("workspace", ready.upload.id, { contentType: "text/plain", size: 1 });
    await module.store.markFileDeleted("workspace", ready.file.id, "actor", now);
    const [first, second] = await Promise.all([
      module.store.claimFilePendingPhysicalDelete("workspace", ready.file.id),
      module.store.claimFilePendingPhysicalDelete("workspace", ready.file.id),
    ]);
    expect([first, second].filter(Boolean)).toHaveLength(1);
  });
});
