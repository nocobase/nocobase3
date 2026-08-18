import { describe, expect, it } from "vitest";
import { Migrator } from "kysely";
import { decodeJson, toSafeNumber } from "../../src/persistence/serialization.ts";
import { KyselyFilesStore } from "../../src/persistence/kysely-files-store.ts";
import { FilesMigrationProvider } from "../../src/persistence/migrations/index.ts";
import { createTestDatabase } from "./test-database.ts";

describe("persistence boundaries", () => {
  it("rejects malformed JSON and unsafe sizes", () => {
    expect(() => decodeJson("[]")).toThrow();
    expect(() => toSafeNumber(Number.MAX_SAFE_INTEGER + 1)).toThrow();
  });

  it("replays and rejects idempotency reuse, then completes once", async () => {
    const db = createTestDatabase();
    await new Migrator({ db, provider: new FilesMigrationProvider() }).migrateToLatest();
    const store = new KyselyFilesStore(db, () => new Date("2026-01-01T00:00:00.000Z"));
    const input = { file: { id: "f1", workspaceId: "a", backendKey: "local", policy: "default", storageKey: "k1", originalName: "a.txt", contentType: "text/plain", size: 1, createdBy: "u1" }, upload: { id: "u1", idempotencyKey: "key", requestFingerprint: "fp", expiresAt: new Date("2026-01-02T00:00:00.000Z") } };
    expect((await store.createPendingUpload(input)).kind).toBe("created");
    expect((await store.createPendingUpload({ ...input, file: { ...input.file, id: "other" }, upload: { ...input.upload, id: "other" } })).kind).toBe("replayed");
    await expect(store.createPendingUpload({ ...input, file: { ...input.file, id: "other2" }, upload: { ...input.upload, id: "other2", requestFingerprint: "different" } })).rejects.toThrow("FILES_IDEMPOTENCY_KEY_REUSED");
    const ready = await store.completeUpload("a", "u1", { contentType: "text/plain", size: 1 });
    expect(ready.status).toBe("ready");
    expect((await store.completeUpload("a", "u1", { contentType: "wrong", size: 99 })).id).toBe("f1");
    await db.destroy();
  });
});
