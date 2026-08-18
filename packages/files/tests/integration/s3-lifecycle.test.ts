import { OpenAPIHono } from "@hono/zod-openapi";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createFilesModule, filesMigrations, S3StorageDriver } from "../../src/index.ts";
import { createTestDatabase } from "../persistence/test-database.ts";

describe("S3 Kernel lifecycle", () => {
  let db: ReturnType<typeof createTestDatabase>; let app: OpenAPIHono; let calls: any[]; let object: any; let failDelete: boolean; let store: ReturnType<typeof createFilesModule>["store"];
  beforeEach(async () => {
    db = createTestDatabase(); await filesMigrations["001-create-files-tables"].up!(db); calls = []; object = null; failDelete = false;
    const client = { send: async (command: any) => { calls.push(command); if (command.constructor.name === "HeadObjectCommand") { if (!object) { const error: any = new Error("missing"); error.name = "NotFound"; throw error; } return object; } if (command.constructor.name === "DeleteObjectCommand") { if (failDelete) { const error: any = new Error("down"); error.$metadata = { httpStatusCode: 503 }; throw error; } object = null; } return {}; } };
    const driver = new S3StorageDriver({ driver: "s3", region: "auto", container: "private", rootPrefix: "root", credentials: { accessKeyId: "test", secretAccessKey: "S3_TEST_SECRET_MUST_NOT_LEAK" } }, { client, presigner: async (_client, command: any) => { calls.push(command); return `https://signed.invalid/${command.constructor.name}`; } });
    let id = 0; const module = createFilesModule({ db, config: { defaultPolicy: "default", backends: { s3: { driver: "s3", region: "auto", container: "private", credentials: { accessKeyId: "test", secretAccessKey: "S3_TEST_SECRET_MUST_NOT_LEAK" } } }, policies: { default: { backend: "s3", description: "S3", maxSize: 100, allowedContentTypes: ["text/*"], uploadUrlTtlSeconds: 60, defaultReadUrlTtlSeconds: 30, maxReadUrlTtlSeconds: 60 } } }, drivers: { s3: driver }, requestContext: { getActor: (c: any) => ({ id: c.req.header("x-actor") ?? "actor" }), getWorkspaceId: () => "workspace" }, authorizer: { authorize: async input => { if (input.actor.id === "denied") throw new Error("denied"); } }, generateId: () => `s3-${++id}` });
    store = module.store; app = new OpenAPIHono().route("/api/files/v1", module.router);
  });
  afterEach(async () => db.destroy());
  async function create(size = 5) { const response = await app.request("/api/files/v1/uploads", { method: "POST", headers: { "content-type": "application/json", "Idempotency-Key": `key-${size}` }, body: JSON.stringify({ originalName: "a.txt", contentType: "text/plain", size }) }); return { response, data: (await response.json() as any).data }; }
  it("keeps provider state private across PUT, HEAD, GET, and exact-key delete", async () => {
    const { response, data } = await create(); expect(response.status).toBe(201); expect(data.target).toMatchObject({ mode: "presigned-put", method: "PUT" }); expect(JSON.stringify(data)).not.toMatch(/private|root\/|credentials|providerState|S3_TEST_SECRET/);
    object = { ContentLength: 5, ContentType: "text/plain", ETag: '"not-sha256"' }; expect((await app.request(`/api/files/v1/uploads/${data.uploadId}/complete`, { method: "POST" })).status).toBe(200);
    const url = await app.request(`/api/files/v1/files/${data.fileId}/url`, { method: "POST", headers: { "content-type": "application/json" }, body: '{"disposition":"attachment"}' }); expect(url.status).toBe(200); expect(JSON.stringify(await url.json())).not.toMatch(/private|root\/|credentials|providerState/);
    expect((await app.request(`/api/files/v1/files/${data.fileId}`, { method: "DELETE" })).status).toBe(204); expect(calls.at(-1).input.Key).toMatch(/^root\/w\//); expect((await store.getFile("workspace", data.fileId, { includeDeleted: true }))?.storageDeleteStatus).toBe("completed");
  });
  it("does not call S3 before authorization and leaves transient deletion pending", async () => {
    const { data } = await create(); object = { ContentLength: 5, ContentType: "text/plain" }; await app.request(`/api/files/v1/uploads/${data.uploadId}/complete`, { method: "POST" });
    const before = calls.length; expect((await app.request(`/api/files/v1/files/${data.fileId}/url`, { method: "POST", headers: { "content-type": "application/json", "x-actor": "denied" }, body: "{}" })).status).toBe(403); expect((await app.request(`/api/files/v1/files/${data.fileId}`, { method: "DELETE", headers: { "x-actor": "denied" } })).status).toBe(403); expect(calls).toHaveLength(before);
    failDelete = true; expect((await app.request(`/api/files/v1/files/${data.fileId}`, { method: "DELETE" })).status).toBe(204); expect((await store.getFile("workspace", data.fileId, { includeDeleted: true }))?.storageDeleteStatus).toBe("pending");
    failDelete = false; object = { ContentLength: 5, ContentType: "text/plain" }; const mismatch = await create(9); expect((await app.request(`/api/files/v1/uploads/${mismatch.data.uploadId}/complete`, { method: "POST" })).status).toBe(409);
  });
});
