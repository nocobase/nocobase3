import { describe, expect, it } from "vitest";
import { S3StorageDriver } from "../../src/storage/s3/s3-storage-driver.ts";
import { parseFilesConfig, createPublicFilesConfig } from "../../src/config/index.ts";

const config = { driver: "s3" as const, endpoint: "http://minio.test", region: "us-east-1", container: "private", rootPrefix: "/tenant/", forcePathStyle: true, credentials: { accessKeyId: "S3_TEST_ACCESS", secretAccessKey: "S3_TEST_SECRET_MUST_NOT_LEAK" } };
const future = () => new Date(Date.now() + 60_000);
function fake() {
  const calls: any[] = [];
  return { calls, client: { send: async (command: any) => { calls.push(command); if (command.constructor.name === "HeadObjectCommand") return { ContentLength: 5, ContentType: "text/plain", ETag: '"etag"', Metadata: { "NoCoBase-Sha256": "abc" } }; return {}; } }, presigner: async (_client: any, command: any) => { calls.push(command); return `https://signed.test/${command.input.Key}`; } };
}
describe("S3 storage driver", () => {
  it("presigns PUT, maps prefix, and preserves checksum metadata without treating ETag as SHA-256", async () => {
    const f = fake(); const driver = new S3StorageDriver(config, f);
    const prepared = await driver.prepareUpload({ key: "w/ws/objects/f", contentType: "text/plain", size: 5, checksumSha256: "abc", expiresAt: future() });
    expect(prepared).toMatchObject({ mode: "presigned-put", method: "PUT", headers: { "Content-Type": "text/plain", "x-amz-meta-nocobase-sha256": "abc" } });
    expect(f.calls[0].input).toMatchObject({ Bucket: "private", Key: "tenant/w/ws/objects/f", ContentType: "text/plain", Metadata: { "nocobase-sha256": "abc" } });
    expect(await driver.statObject({ key: "w/ws/objects/f" })).toMatchObject({ size: 5, contentType: "text/plain", etag: '"etag"', checksumSha256: "abc" });
  });
  it("presigns GET with safe disposition and deletes the exact object", async () => {
    const f = fake(); const driver = new S3StorageDriver(config, f);
    const target = await driver.createExternalReadTarget({ key: "w/x", fileName: "a b.txt", contentType: "text/plain", disposition: "attachment", expiresAt: future() });
    expect(target).toMatchObject({ method: "GET", headers: {} }); expect(f.calls[0].input).toMatchObject({ Bucket: "private", Key: "tenant/w/x", ResponseContentType: "text/plain" });
    await driver.deleteObject({ key: "w/x" }); expect(f.calls.at(-1).input).toEqual({ Bucket: "private", Key: "tenant/w/x" });
  });
  it("normalizes private config and never projects provider fields", () => {
    const parsed = parseFilesConfig({ defaultPolicy: "p", backends: { s: config }, policies: { p: { backend: "s", description: "S3", maxSize: 10, allowedContentTypes: ["*/*"], uploadUrlTtlSeconds: 10, defaultReadUrlTtlSeconds: 10, maxReadUrlTtlSeconds: 20 } } });
    expect(parsed.backends.s).toMatchObject({ rootPrefix: "tenant", endpoint: "http://minio.test" });
    const publicConfig = JSON.stringify(createPublicFilesConfig(parsed, [{ uploadModes: ["presigned-put"] }])); expect(publicConfig).not.toContain("private"); expect(publicConfig).not.toContain("S3_TEST_SECRET_MUST_NOT_LEAK");
  });
});
