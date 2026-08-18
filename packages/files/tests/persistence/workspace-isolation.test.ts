import { Migrator } from "kysely";
import { describe, expect, it } from "vitest";
import { KyselyFilesStore } from "../../src/persistence/kysely-files-store.ts";
import { FilesMigrationProvider } from "../../src/persistence/migrations/index.ts";
import { createTestDatabase } from "./test-database.ts";

describe("workspace isolation", () => {
  it("does not leak files or upload ids across workspaces", async () => {
    const db = createTestDatabase();
    await new Migrator({ db, provider: new FilesMigrationProvider() }).migrateToLatest();
    const store = new KyselyFilesStore(db);
    const base = { file: { id: "fa", workspaceId: "a", backendKey: "local", policy: "p", storageKey: "ka", originalName: "a", contentType: "text/plain", size: 0, createdBy: "u" }, upload: { id: "ua", idempotencyKey: "same", requestFingerprint: "fp", expiresAt: new Date(Date.now() + 10000) } };
    await store.createPendingUpload(base);
    await store.createPendingUpload({ ...base, file: { ...base.file, id: "fb", workspaceId: "b", storageKey: "kb" }, upload: { ...base.upload, id: "ub" } });
    expect(await store.getFile("b", "fa")).toBeUndefined();
    expect(await store.getUpload("b", "ua")).toBeUndefined();
    expect((await store.createPendingUpload({ ...base, file: { ...base.file, id: "fc", createdBy: "other", storageKey: "kc" }, upload: { ...base.upload, id: "uc" } })).kind).toBe("created");
    await db.destroy();
  });
});
