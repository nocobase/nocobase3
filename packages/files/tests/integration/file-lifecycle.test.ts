import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { OpenAPIHono } from "@hono/zod-openapi";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createFilesModule, createFilesOpenAPIDocument, filesMigrations, LocalStorageDriver } from "../../src/index.ts";
import { signTransferToken } from "../../src/security/transfer-token.ts";
import { createTestDatabase } from "../persistence/test-database.ts";

class ObservedLocalDriver extends LocalStorageDriver {
  failDelete = false;
  cancelled = false;
  override async deleteObject(input: Parameters<LocalStorageDriver["deleteObject"]>[0]) {
    if (this.failDelete) throw new Error("private storage failure");
    return super.deleteObject(input);
  }
  override async openRead(input: Parameters<LocalStorageDriver["openRead"]>[0]) {
    const opened = await super.openRead(input);
    const reader = opened.body.getReader();
    return { ...opened, body: new ReadableStream<Uint8Array>({ async pull(controller) { const next = await reader.read(); next.done ? controller.close() : controller.enqueue(next.value); }, cancel: async reason => { this.cancelled = true; await reader.cancel(reason); } }) };
  }
}

describe("G06 Local read URL and deletion lifecycle", () => {
  let root: string;
  let db: ReturnType<typeof createTestDatabase>;
  let app: OpenAPIHono;
  let router: OpenAPIHono;
  let driver: ObservedLocalDriver;
  let store: ReturnType<typeof createFilesModule>["store"];
  let now: Date;
  let authorizations: any[];
  const secret = "s".repeat(32);

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "files-g06-"));
    db = createTestDatabase();
    await filesMigrations["001-create-files-tables"].up!(db);
    await filesMigrations["002-add-upload-cleanup-status"].up!(db);
    driver = new ObservedLocalDriver({ root });
    now = new Date("2026-08-18T00:00:00.000Z");
    authorizations = [];
    let id = 0;
    const module = createFilesModule({
      db,
      config: { defaultPolicy: "default", backends: { local: { driver: "local", root, signingSecret: secret } }, policies: { default: { backend: "local", description: "Default", maxSize: 1024 * 1024, allowedContentTypes: ["*/*"], uploadUrlTtlSeconds: 60, defaultReadUrlTtlSeconds: 60, maxReadUrlTtlSeconds: 120 } } },
      drivers: { local: driver },
      requestContext: { getActor: (c: any) => ({ id: c.req.header("x-actor") ?? "actor" }), getWorkspaceId: (c: any) => c.req.header("x-workspace") ?? "workspace" },
      authorizer: { authorize: async input => { authorizations.push(input); if (input.actor.id === "denied") throw new Error("denied"); } },
      now: () => now,
      generateId: () => `g06-${++id}`,
    });
    store = module.store;
    router = module.router;
    app = new OpenAPIHono().route("/api/files/v1", router);
  });

  afterEach(async () => { await db.destroy(); await rm(root, { recursive: true, force: true }); });

  async function createPending(key: string, name = "a.txt", bytes = new TextEncoder().encode("hello world")) {
    const response = await app.request("/api/files/v1/uploads", { method: "POST", headers: { "content-type": "application/json", "Idempotency-Key": key }, body: JSON.stringify({ originalName: name, contentType: "text/plain", size: bytes.byteLength, context: { owner: "actor" } }) });
    expect(response.status).toBe(201);
    return { data: (await response.json() as any).data, bytes };
  }

  async function upload(key: string, name = "a.txt", bytes = new TextEncoder().encode("hello world")) {
    const pending = await createPending(key, name, bytes);
    const target = new URL(pending.data.target.url);
    const put = await app.request(target.pathname + target.search, { method: "PUT", headers: { "x-workspace": "workspace", "content-type": "text/plain" }, body: bytes });
    expect(put.status).toBe(204);
    expect((await app.request(`/api/files/v1/uploads/${pending.data.uploadId}/complete`, { method: "POST" })).status).toBe(200);
    return pending;
  }

  async function createUrl(fileId: string, body: Record<string, unknown> = {}, headers: Record<string, string> = {}) {
    return app.request(`/api/files/v1/files/${fileId}/url`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
  }

  it("gets authorized public metadata and streams exact inline bytes with the policy default TTL", async () => {
    const { data, bytes } = await upload("read");
    const metadata = await app.request(`/api/files/v1/files/${data.fileId}`);
    expect(metadata.status).toBe(200);
    const metadataJson = await metadata.json() as any;
    expect(metadataJson.data).toMatchObject({ id: data.fileId, status: "ready", originalName: "a.txt" });
    expect(JSON.stringify(metadataJson)).not.toMatch(/accessContext|storageKey|backendKey|signingSecret|owner/);
    const issued = await createUrl(data.fileId);
    expect(issued.status).toBe(200);
    const temporary = (await issued.json() as any).data;
    expect(temporary.expiresAt).toBe("2026-08-18T00:01:00.000Z");
    expect(temporary.url).not.toMatch(/a\.txt|storage|secret|owner/);
    const delivery = await app.request(new URL(temporary.url).pathname + new URL(temporary.url).search);
    expect(delivery.status).toBe(200);
    expect(new Uint8Array(await delivery.arrayBuffer())).toEqual(bytes);
    expect(delivery.headers.get("content-type")).toBe("text/plain");
    expect(delivery.headers.get("content-length")).toBe(String(bytes.byteLength));
    expect(delivery.headers.get("content-disposition")).toContain("inline");
    expect(delivery.headers.get("cache-control")).toBe("private, max-age=60");
    expect(delivery.headers.get("x-content-type-options")).toBe("nosniff");
    expect(authorizations.some(input => input.action === "files.read" && input.context.owner === "actor")).toBe(true);
  });

  it("validates TTL and rejects pending and failed files for URL creation", async () => {
    const ready = await upload("ttl");
    expect((await createUrl(ready.data.fileId, { expiresIn: 121 })).status).toBe(400);
    expect((await createUrl(ready.data.fileId, { expiresIn: 0 })).status).toBe(400);
    const pending = await createPending("pending");
    expect((await createUrl(pending.data.fileId)).status).toBe(409);
    const failed = await createPending("failed", "failed.txt", new TextEncoder().encode("abc"));
    const target = new URL(failed.data.target.url);
    expect((await app.request(target.pathname + target.search, { method: "PUT", headers: { "x-workspace": "workspace", "content-type": "text/plain" }, body: "four" })).status).toBe(409);
    expect((await createUrl(failed.data.fileId)).status).toBe(409);
    expect((await app.request(`/api/files/v1/files/${pending.data.fileId}`)).status).toBe(200);
  });

  it("reauthorizes operations and makes cross-workspace files non-enumerable", async () => {
    const { data } = await upload("authorization");
    for (const [method, suffix, body] of [["GET", "", undefined], ["POST", "/url", "{}"], ["DELETE", "", undefined]] as const) {
      expect((await app.request(`/api/files/v1/files/${data.fileId}${suffix}`, { method, headers: { "x-actor": "denied", ...(body ? { "content-type": "application/json" } : {}) }, body })).status).toBe(403);
      expect((await app.request(`/api/files/v1/files/${data.fileId}${suffix}`, { method, headers: { "x-workspace": "other", ...(body ? { "content-type": "application/json" } : {}) }, body })).status).toBe(404);
      expect((await app.request(`/api/files/v1/files/missing${suffix}`, { method, headers: body ? { "content-type": "application/json" } : {}, body })).status).toBe(404);
    }
  });

  it("rejects tampered, expired, wrong-file, and wrong-workspace capabilities", async () => {
    const { data } = await upload("tokens");
    const temporary = (await (await createUrl(data.fileId)).json() as any).data;
    const target = new URL(temporary.url);
    expect((await app.request(`${target.pathname}${target.search}x`)).status).toBe(403);
    expect((await app.request(`/api/files/v1/delivery/other${target.search}`)).status).toBe(403);
    const wrongWorkspace = signTransferToken({ version: 1, action: "read", workspaceId: "other", subjectId: data.fileId, expiresAt: Math.floor(now.getTime() / 1000) + 60, disposition: "inline" }, secret);
    expect((await app.request(`/api/files/v1/delivery/${data.fileId}?token=${encodeURIComponent(wrongWorkspace)}`)).status).toBe(404);
    now = new Date(now.getTime() + 61_000);
    expect((await app.request(target.pathname + target.search)).status).toBe(403);
  });

  it("uses safe Unicode attachment headers and propagates stream cancellation", async () => {
    const bytes = new Uint8Array(256 * 1024).fill(97);
    const { data } = await upload("unicode", "中文合同.pdf", bytes);
    const temporary = (await (await createUrl(data.fileId, { disposition: "attachment" })).json() as any).data;
    const response = await app.request(new URL(temporary.url).pathname + new URL(temporary.url).search);
    expect(response.headers.get("content-disposition")).toContain("filename*=UTF-8''%E4%B8%AD%E6%96%87%E5%90%88%E5%90%8C.pdf");
    const reader = response.body!.getReader();
    expect((await reader.read()).value?.byteLength).toBeGreaterThan(0);
    await reader.cancel("test cancellation");
    expect(driver.cancelled).toBe(true);
    await db.updateTable("files").set({ original_name: "name\r\nInjected: x" }).where("id", "=", data.fileId).execute();
    const injected = (await (await createUrl(data.fileId, { disposition: "attachment" })).json() as any).data;
    const safe = await app.request(new URL(injected.url).pathname + new URL(injected.url).search);
    expect(safe.headers.get("content-disposition")).not.toMatch(/[\r\n]/);
    expect(safe.headers.get("Injected")).toBeNull();
    await safe.body?.cancel();
  });

  it("tombstones before best-effort delete, revokes old URLs, and keeps delete idempotent", async () => {
    const { data } = await upload("delete");
    const temporary = (await (await createUrl(data.fileId)).json() as any).data;
    expect((await app.request(`/api/files/v1/files/${data.fileId}`, { method: "DELETE" })).status).toBe(204);
    expect((await app.request(`/api/files/v1/files/${data.fileId}`)).status).toBe(404);
    expect((await createUrl(data.fileId)).status).toBe(404);
    expect((await app.request(new URL(temporary.url).pathname + new URL(temporary.url).search)).status).toBe(404);
    expect((await app.request(`/api/files/v1/files/${data.fileId}`, { method: "DELETE" })).status).toBe(204);
    const deleted = await store.getFile("workspace", data.fileId, { includeDeleted: true });
    expect(deleted).toMatchObject({ status: "deleted", storageDeleteStatus: "completed" });
  });

  it("returns 204 after transient physical deletion failure and leaves retryable pending state", async () => {
    const { data } = await upload("delete-failure");
    driver.failDelete = true;
    expect((await app.request(`/api/files/v1/files/${data.fileId}`, { method: "DELETE" })).status).toBe(204);
    expect((await app.request(`/api/files/v1/files/${data.fileId}`)).status).toBe(404);
    expect(await store.listFilesPendingPhysicalDelete(10)).toEqual([expect.objectContaining({ id: data.fileId, status: "deleted", storageDeleteStatus: "pending" })]);
    driver.failDelete = false;
    expect((await app.request(`/api/files/v1/files/${data.fileId}`, { method: "DELETE" })).status).toBe(204);
    expect((await store.getFile("workspace", data.fileId, { includeDeleted: true }))?.storageDeleteStatus).toBe("pending");
  });

  it("rejects a stored-object size mismatch without exposing storage errors", async () => {
    const { data } = await upload("size-mismatch");
    await db.updateTable("files").set({ size: 1 }).where("id", "=", data.fileId).execute();
    const temporary = (await (await createUrl(data.fileId)).json() as any).data;
    const response = await app.request(new URL(temporary.url).pathname + new URL(temporary.url).search);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: { code: "FILES_FILE_SIZE_MISMATCH", message: "Stored file size mismatch", retryable: false } });
  });

  it("publishes all seven Kernel operations plus binary Local delivery without private fields", () => {
    const document = createFilesOpenAPIDocument(router);
    const paths = document.paths as Record<string, Record<string, { operationId: string }>>;
    expect(Object.keys(paths)).toEqual(expect.arrayContaining(["/api/files/v1/config", "/api/files/v1/files/{fileId}", "/api/files/v1/uploads", "/api/files/v1/uploads/{uploadId}/content", "/api/files/v1/uploads/{uploadId}/complete", "/api/files/v1/files/{fileId}/url", "/api/files/v1/delivery/{fileId}"]));
    expect(paths["/api/files/v1/files/{fileId}"].get.operationId).toBe("filesGetFile");
    expect(paths["/api/files/v1/files/{fileId}"].delete.operationId).toBe("filesDeleteFile");
    expect(paths["/api/files/v1/files/{fileId}/url"].post.operationId).toBe("filesCreateUrl");
    expect(JSON.stringify(paths["/api/files/v1/delivery/{fileId}"])).toContain('"format":"binary"');
    expect(JSON.stringify(document)).not.toMatch(/storageKey|accessContext|providerState|signingSecret|backendKey/);
  });
});
