import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { OpenAPIHono } from "@hono/zod-openapi";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createFilesClient } from "../../../portal-sdk/src/files/files-client.ts";
import type { NocoBaseClient } from "../../../portal-sdk/src/client/index.ts";
import { createFilesModule, filesMigrations, LocalStorageDriver } from "../../src/index.ts";
import { createTestDatabase } from "../persistence/test-database.ts";

class ChunkedLocalDriver extends LocalStorageDriver {
  chunks = 0;
  override putObject(input: Parameters<LocalStorageDriver["putObject"]>[0]) {
    const reader = input.body.getReader();
    const body = new ReadableStream<Uint8Array>({ pull: async controller => { const next = await reader.read(); if (next.done) controller.close(); else { this.chunks++; controller.enqueue(next.value); } } });
    return super.putObject({ ...input, body });
  }
}

describe("Local Files full-stack acceptance", () => {
  let root: string;
  let db: ReturnType<typeof createTestDatabase>;
  let app: OpenAPIHono;
  let module: ReturnType<typeof createFilesModule>;
  let driver: ChunkedLocalDriver;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "files-g11-"));
    db = createTestDatabase();
    await filesMigrations["001-create-files-tables"].up!(db);
    await filesMigrations["002-add-upload-cleanup-status"].up!(db);
    driver = new ChunkedLocalDriver({ root });
    module = createFilesModule({ db, config: { defaultPolicy: "default", backends: { local: { driver: "local", root, signingSecret: "s".repeat(32) } }, policies: { default: { backend: "local", description: "Default", maxSize: 1024 * 1024, allowedContentTypes: ["*/*"], uploadUrlTtlSeconds: 60, defaultReadUrlTtlSeconds: 60, maxReadUrlTtlSeconds: 120 } } }, drivers: { local: driver }, requestContext: { getActor: () => ({ id: "actor" }), getWorkspaceId: () => "workspace" }, authorizer: { authorize: async () => undefined } });
    app = new OpenAPIHono().route("/api/files/v1", module.router);
  });

  afterEach(async () => { await db.destroy(); await rm(root, { recursive: true, force: true }); });

  it("runs SDK upload, App reference, delivery, explicit delete, and maintenance end to end", async () => {
    const request = async <T>(endpoint: string, options: any = {}): Promise<T> => {
      const headers = new Headers(options.headers);
      let body: BodyInit | undefined;
      if (options.body !== undefined) { headers.set("content-type", "application/json"); body = JSON.stringify(options.body); }
      const response = await app.request(endpoint, { method: options.method, headers, body, signal: options.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (response.status === 204 || options.unwrap === "none") return undefined as T;
      return (await response.json() as { data: T }).data;
    };
    const transport = { request, resolveUrl: (value: string) => new URL(value, "http://files.test").href, getApiUrl: () => "http://files.test/api" } as unknown as NocoBaseClient;
    const files = createFilesClient({ client: transport, fetch: async (input, init) => {
      const bytes = new Uint8Array(await (init?.body as Blob).arrayBuffer());
      let offset = 0;
      const body = new ReadableStream<Uint8Array>({ pull(controller) { if (offset === bytes.length) return controller.close(); const end = Math.min(offset + 64 * 1024, bytes.length); controller.enqueue(bytes.slice(offset, end)); offset = end; } });
      return app.request(new Request(input, { ...init, body, duplex: "half" } as RequestInit));
    } });
    const bytes = new Uint8Array(256 * 1024); bytes.forEach((_, index) => { bytes[index] = index % 251; });
    const uploaded = await files.upload(new Blob([bytes], { type: "application/octet-stream" }), { originalName: "payload.bin", idempotencyKey: "g11-full-stack" });
    expect(driver.chunks).toBeGreaterThan(1);

    let appAttachmentFileId: string | undefined = String(uploaded.id);
    expect(await files.get(appAttachmentFileId)).toMatchObject({ id: uploaded.id, status: "ready" });
    const inline = await files.createUrl(appAttachmentFileId, { disposition: "inline" });
    expect(new Uint8Array(await (await app.request(inline.url)).arrayBuffer())).toEqual(bytes);
    const attachment = await files.createUrl(appAttachmentFileId, { disposition: "attachment" });
    expect((await app.request(attachment.url)).headers.get("content-disposition")).toContain("attachment");

    appAttachmentFileId = undefined;
    expect((await files.get(String(uploaded.id))).status).toBe("ready");
    await files.remove(String(uploaded.id));
    expect((await app.request(inline.url)).status).toBe(404);
    expect(await module.maintenance.runOnce()).toEqual({ expiredUploads: { scanned: 0, succeeded: 0, retried: 0, failed: 0, skipped: 0 }, deletedObjects: { scanned: 0, succeeded: 0, retried: 0, failed: 0, skipped: 0 } });
  });
});
