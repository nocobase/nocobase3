import { describe, expect, it } from "vitest";
import { CreateUploadInputSchema, FileObjectSchema, FILES_ROUTES, IdempotencyKeySchema, PublicFilesConfigSchema } from "../src/index.ts";

describe("Files contracts", () => {
  it("accepts valid public values and rejects invalid upload values", () => {
    expect(IdempotencyKeySchema.safeParse("request-1").success).toBe(true);
    expect(IdempotencyKeySchema.safeParse("   ").success).toBe(false);
    expect(CreateUploadInputSchema.safeParse({ originalName: "a.txt", contentType: "text/plain", size: 1 }).success).toBe(true);
    expect(CreateUploadInputSchema.safeParse({ originalName: "a.txt", contentType: "text/plain", size: -1 }).success).toBe(false);
    expect(FileObjectSchema.safeParse({ id: "f", policy: "default", originalName: "a", contentType: "text/plain", size: 1, status: "unknown", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }).success).toBe(false);
  });
  it("keeps public config and file objects free of private fields", () => {
    const config = { apiVersion: "files/v1", defaultPolicy: "default", policies: { default: { description: "Default", maxSize: 100, allowedContentTypes: ["text/plain"], url: { defaultTtlSeconds: 60, maxTtlSeconds: 300 } } }, capabilities: { uploadModes: ["proxy"], temporaryUrls: true } };
    expect(PublicFilesConfigSchema.safeParse({ ...config, backend: "private" }).success).toBe(false);
    expect(FileObjectSchema.safeParse({ id: "f", policy: "default", originalName: "a", contentType: "text/plain", size: 1, status: "ready", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), storageKey: "secret" }).success).toBe(false);
  });
  it("defines unique frozen routes and operation ids", () => {
    const routes = Object.values(FILES_ROUTES);
    expect(new Set(routes.map((route) => `${route.method} ${route.path}`)).size).toBe(routes.length);
    expect(new Set(routes.map((route) => route.operationId)).size).toBe(routes.length);
  });
});
