import { describe, expect, it } from "vitest";
import { FileService } from "../../src/application/file-service.ts";
import { parseFilesConfig } from "../../src/config/index.ts";
import { InMemoryStorageDriverRegistry } from "../../src/storage/driver-registry.ts";
import type { FileRecord, FilesStore } from "../../src/persistence/index.ts";

describe("FileService", () => {
  it("uses the stored policy default TTL after read authorization", async () => {
    const file: FileRecord = { id: "f", workspaceId: "w", backendKey: "local", policy: "p", storageKey: "private", originalName: "a.txt", contentType: "text/plain", size: 1, status: "ready", accessContext: { owner: "a" }, createdBy: "a", createdAt: new Date(0), updatedAt: new Date(0), storageDeleteStatus: "pending" };
    const store = { getFile: async (workspaceId: string, fileId: string) => workspaceId === "w" && fileId === "f" ? file : undefined } as FilesStore;
    const driver = { type: "local", capabilities: () => ({ uploadModes: ["proxy"] as ["proxy"], externalReadTarget: false }), prepareUpload: async () => ({ mode: "proxy" as const }), statObject: async () => null, deleteObject: async () => undefined };
    const authorized: unknown[] = [];
    const service = new FileService({ config: parseFilesConfig({ defaultPolicy: "p", backends: { local: { driver: "local", root: ".", signingSecret: "s".repeat(32) } }, policies: { p: { backend: "local", description: "P", maxSize: 1, allowedContentTypes: ["*/*"], uploadUrlTtlSeconds: 10, defaultReadUrlTtlSeconds: 30, maxReadUrlTtlSeconds: 60 } } }), store, registry: new InMemoryStorageDriverRegistry({ local: driver }), authorizer: { authorize: async input => { authorized.push(input); } }, now: () => new Date("2026-08-18T00:00:00.000Z") });
    const result = await service.createUrl({ id: "a" }, "w", "f", {});
    expect(result.expiresAt).toBe("2026-08-18T00:00:30.000Z");
    expect(authorized).toEqual([expect.objectContaining({ action: "files.read", workspaceId: "w", context: { owner: "a" } })]);
    await expect(service.get({ id: "a" }, "other", "f")).rejects.toMatchObject({ code: "FILES_FILE_NOT_FOUND" });
  });
});
