import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { OpenAPIHono } from "@hono/zod-openapi";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createFilesModule, createFilesOpenAPIDocument, filesMigrations, LocalStorageDriver } from "../../src/index.ts";
import { createTestDatabase } from "../persistence/test-database.ts";

describe("G05 proxy upload lifecycle", () => {
  let root: string; let db: ReturnType<typeof createTestDatabase>; let app: OpenAPIHono; let router: OpenAPIHono; let authorizations: unknown[]; let now: Date;
  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "files-g05-")); db = createTestDatabase(); await filesMigrations["001-create-files-tables"].up!(db); authorizations = []; now = new Date("2026-08-18T00:00:00.000Z"); let id = 0;
    const config = { defaultPolicy: "default", backends: { local: { driver: "local", root, signingSecret: "s".repeat(32) } }, policies: { default: { backend: "local", description: "Default", maxSize: 1024, allowedContentTypes: ["text/*"], uploadUrlTtlSeconds: 60, defaultReadUrlTtlSeconds: 60, maxReadUrlTtlSeconds: 120 }, images: { backend: "local", description: "Images", maxSize: 1024, allowedContentTypes: ["image/png"], uploadUrlTtlSeconds: 60, defaultReadUrlTtlSeconds: 60, maxReadUrlTtlSeconds: 120 } } };
    const module = createFilesModule({ db, config, drivers: { local: new LocalStorageDriver({ root }) }, requestContext: { getActor: (c: any) => ({ id: c.req.header("x-actor") ?? "actor" }), getWorkspaceId: (c: any) => c.req.header("x-workspace") ?? "workspace" }, authorizer: { authorize: async input => { authorizations.push(input); if ((input.actor as any).id === "denied") throw new Error("denied"); } }, now: () => now, generateId: () => `id-${++id}` });
    router = module.router; app = new OpenAPIHono().route("/api/files/v1", router);
  });
  afterEach(async () => { await db.destroy(); await rm(root, { recursive: true, force: true }); });
  const create = (key = "key", body: Record<string, unknown> = {}) => app.request("/api/files/v1/uploads", { method: "POST", headers: { "content-type": "application/json", "Idempotency-Key": key }, body: JSON.stringify({ originalName: "a.txt", contentType: "text/plain", size: 11, ...body }) });
  it("creates, streams proxy content, completes, and safely replays", async () => {
    const first = await create(); expect(first.status).toBe(201); const created = (await first.json() as any).data;
    const replay = await create(); expect((await replay.json() as any).data).toEqual(created);
    const target = new URL(created.target.url, "http://local"); const chunks = [new TextEncoder().encode("hello "), new TextEncoder().encode("world")]; const stream = new ReadableStream({ pull(controller) { const chunk = chunks.shift(); chunk ? controller.enqueue(chunk) : controller.close(); } }); const put = await app.request(new Request(new URL(target.pathname + target.search, "http://local"), { method: "PUT", headers: { "x-workspace": "workspace", "content-type": "text/plain", "content-length": "11" }, body: stream, duplex: "half" } as RequestInit)); expect(put.status).toBe(204);
    expect((await app.request(target.pathname + target.search, { method: "PUT", headers: { "x-workspace": "workspace", "content-type": "text/plain" }, body: "hello world" })).status).toBe(204);
    const complete = await app.request(`/api/files/v1/uploads/${created.uploadId}/complete`, { method: "POST" }); const body = await complete.json() as any; expect(complete.status).toBe(200); expect(body.data.file).toMatchObject({ id: created.fileId, policy: "default", status: "ready", size: 11, checksum: { value: createHash("sha256").update("hello world").digest("hex") } }); expect(JSON.stringify(body)).not.toMatch(/storageKey|providerState|signingSecret/);
    expect((await app.request(`/api/files/v1/uploads/${created.uploadId}/complete`, { method: "POST" })).status).toBe(200); expect(authorizations).toHaveLength(4);
  });
  it("enforces policy, authorization, idempotency, capability, and completeness", async () => {
    expect((await app.request("/api/files/v1/uploads", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).status).toBe(400);
    expect((await create("large", { size: 2048 })).status).toBe(413); expect((await create("mime", { contentType: "application/pdf" })).status).toBe(415);
    expect((await app.request("/api/files/v1/uploads", { method: "POST", headers: { "content-type": "application/json", "Idempotency-Key": "deny", "x-actor": "denied" }, body: JSON.stringify({ originalName: "a.txt", contentType: "text/plain", size: 1 }) })).status).toBe(403);
    const created = (await (await create("same")).json() as any).data; expect((await create("same", { size: 12 })).status).toBe(409); expect((await app.request(`/api/files/v1/uploads/${created.uploadId}/complete`, { method: "POST" })).status).toBe(409);
    const target = new URL(created.target.url, "http://local"); expect((await app.request(target.pathname + target.search.replace(/.$/, "x"), { method: "PUT", headers: { "x-workspace": "workspace", "content-type": "text/plain" }, body: "hello world" })).status).toBe(403);
    expect((await app.request(target.pathname + target.search, { method: "PUT", headers: { "x-workspace": "other", "content-type": "text/plain" }, body: "hello world" })).status).toBe(403);
  });
  it("documents config and all G05 operations without private fields", () => {
    const document = createFilesOpenAPIDocument(router); const text = JSON.stringify(document); expect(text).toContain("filesCreateUpload"); expect(text).toContain("filesUploadProxyContent"); expect(text).toContain("filesCompleteUpload"); expect(text).not.toMatch(/storageKey|providerState|signingSecret/); expect(document).toEqual(JSON.parse(readFileSync(new URL("../../openapi/files-v1.json", import.meta.url), "utf8")));
  });
  it("supports explicit policy and canonical context replay", async () => {
    const one = await create("canonical", { policy: "images", originalName: "a.png", contentType: "IMAGE/PNG", context: { b: 2, a: 1 } }); const data = (await one.json() as any).data; expect(JSON.stringify(data)).not.toMatch(/storageKey|providerState|signingSecret|backendKey/);
    const replay = await create("canonical", { policy: "images", originalName: "a.png", contentType: "image/png", context: { a: 1, b: 2 } }); expect((await replay.json() as any).data).toEqual(data);
  });
  it("expires targets and hides cross-workspace completion", async () => {
    const created = (await (await create("expires")).json() as any).data; expect((await app.request(`/api/files/v1/uploads/${created.uploadId}/complete`, { method: "POST", headers: { "x-workspace": "other" } })).status).toBe(404); now = new Date(now.getTime() + 61_000); const target = new URL(created.target.url); expect((await app.request(target.pathname + target.search, { method: "PUT", headers: { "x-workspace": "workspace", "content-type": "text/plain" }, body: "hello world" })).status).toBe(403); expect((await app.request(`/api/files/v1/uploads/${created.uploadId}/complete`, { method: "POST" })).status).toBe(410); expect((await create("expires")).status).toBe(410);
  });
  it("rejects over-size and checksum-mismatched streamed bodies", async () => {
    const over = (await (await create("over", { size: 3 })).json() as any).data; const overTarget = new URL(over.target.url, "http://local"); expect((await app.request(overTarget.pathname + overTarget.search, { method: "PUT", headers: { "x-workspace": "workspace", "content-type": "text/plain" }, body: "four" })).status).toBe(409); expect((await app.request(`/api/files/v1/uploads/${over.uploadId}/complete`, { method: "POST" })).status).toBe(409);
    const checksum = "0".repeat(64); const checked = (await (await create("checksum", { checksum: { algorithm: "sha256", value: checksum } })).json() as any).data; const checkedTarget = new URL(checked.target.url, "http://local"); expect((await app.request(checkedTarget.pathname + checkedTarget.search, { method: "PUT", headers: { "x-workspace": "workspace", "content-type": "text/plain" }, body: "hello world" })).status).toBe(409);
  });
});
