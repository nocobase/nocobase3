import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { S3StorageDriver } from "../../src/storage/s3/s3-storage-driver.ts";

const names = ["ENDPOINT", "REGION", "CONTAINER", "ACCESS_KEY_ID", "SECRET_ACCESS_KEY"] as const;
const env = Object.fromEntries(names.map(name => [name, process.env[`NOCOBASE_FILES_S3_${name}`]])) as Record<(typeof names)[number], string | undefined>;
describe.skipIf(names.some(name => !env[name]))("real S3-compatible contract", () => {
  it("presigns PUT and GET, stats, and deletes", async () => {
    const driver = new S3StorageDriver({ driver: "s3", endpoint: env.ENDPOINT!, region: env.REGION!, container: env.CONTAINER!, rootPrefix: `nocobase-g07-${randomUUID()}`, forcePathStyle: true, credentials: { accessKeyId: env.ACCESS_KEY_ID!, secretAccessKey: env.SECRET_ACCESS_KEY! } });
    const key = "contract/object"; const bytes = new TextEncoder().encode("hello");
    try {
      const put = await driver.prepareUpload({ key, contentType: "text/plain", size: bytes.byteLength, expiresAt: new Date(Date.now() + 60_000) });
      if (put.mode !== "presigned-put") throw new Error("unexpected upload mode");
      expect((await fetch(put.url, { method: "PUT", headers: put.headers, body: bytes })).ok).toBe(true);
      expect(await driver.statObject({ key })).toMatchObject({ size: bytes.byteLength, contentType: "text/plain" });
      const get = await driver.createExternalReadTarget({ key, fileName: "object.txt", contentType: "text/plain", disposition: "attachment", expiresAt: new Date(Date.now() + 60_000) });
      expect(new Uint8Array(await (await fetch(get.url)).arrayBuffer())).toEqual(bytes);
    } finally { await driver.deleteObject({ key }); }
    expect(await driver.statObject({ key })).toBeNull();
  });
});
