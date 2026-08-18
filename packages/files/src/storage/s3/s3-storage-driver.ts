import { S3Client, DeleteObjectCommand, HeadObjectCommand, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { S3BackendConfig } from "./s3-config.ts";
import { validateObjectKey } from "../object-key.ts";
import { StorageDriverError } from "../storage-errors.ts";
import { classifyS3Error } from "./s3-errors.ts";
import { contentDisposition } from "../../security/content-disposition.ts";
import type { StorageDriver, StorageUploadPreparation, StoredObjectStat, ExternalReadTarget } from "../storage-driver.ts";

export interface S3ClientLike { send(command: unknown, options?: { abortSignal?: AbortSignal }): Promise<any> }
export type S3Presigner = (client: S3ClientLike, command: unknown, options: { expiresIn: number }) => Promise<string>;
export class S3StorageDriver implements StorageDriver {
  readonly type = "s3";
  private readonly client: S3ClientLike;
  private readonly sign: S3Presigner;
  private readonly prefix: string;
  constructor(private readonly config: S3BackendConfig, deps: { client?: S3ClientLike; presigner?: S3Presigner } = {}) {
    this.client = deps.client ?? new S3Client({ region: config.region, endpoint: config.endpoint, forcePathStyle: config.forcePathStyle, credentials: config.credentials as any });
    this.sign = deps.presigner ?? ((client, command, options) => getSignedUrl(client as S3Client, command as any, options));
    this.prefix = (config.rootPrefix ?? "").replace(/^\/+|\/+$/g, "");
  }
  capabilities() { return { uploadModes: ["presigned-put"] as ["presigned-put"], externalReadTarget: true }; }
  private key(key: string) { validateObjectKey(key); return this.prefix ? `${this.prefix}/${key}` : key; }
  private ttl(expiresAt: Date) { const seconds = Math.ceil((expiresAt.getTime() - Date.now()) / 1000); if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 31_536_000) throw new StorageDriverError("invalid-object", "invalid expiry"); return seconds; }
  async prepareUpload(input: { key: string; contentType: string; size: number; checksumSha256?: string; expiresAt: Date }): Promise<StorageUploadPreparation> {
    const command = new PutObjectCommand({ Bucket: this.config.container, Key: this.key(input.key), ContentType: input.contentType, ...(input.checksumSha256 ? { Metadata: { "nocobase-sha256": input.checksumSha256 } } : {}) });
    try { return { mode: "presigned-put", method: "PUT", url: await this.sign(this.client, command, { expiresIn: this.ttl(input.expiresAt) }), headers: { "Content-Type": input.contentType, ...(input.checksumSha256 ? { "x-amz-meta-nocobase-sha256": input.checksumSha256 } : {}) }, expiresAt: input.expiresAt }; }
    catch (error) { throw classifyS3Error(error); }
  }
  async statObject(input: { key: string; signal?: AbortSignal }): Promise<StoredObjectStat | null> {
    try {
      const result = await this.client.send(new HeadObjectCommand({ Bucket: this.config.container, Key: this.key(input.key) }), { abortSignal: input.signal });
      const size = result.ContentLength; if (!Number.isSafeInteger(size) || size < 0) throw new StorageDriverError("invalid-object", "invalid object size");
      const metadata = Object.fromEntries(Object.entries(result.Metadata ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
      return { size, contentType: result.ContentType, etag: result.ETag, checksumSha256: typeof metadata["nocobase-sha256"] === "string" ? metadata["nocobase-sha256"] : undefined };
    } catch (error) { if (error instanceof StorageDriverError) throw error; const classified = classifyS3Error(error); if (classified.code === "not-found") return null; throw classified; }
  }
  async createExternalReadTarget(input: { key: string; fileName: string; contentType: string; disposition: "inline" | "attachment"; expiresAt: Date }): Promise<ExternalReadTarget> {
    const command = new GetObjectCommand({ Bucket: this.config.container, Key: this.key(input.key), ResponseContentType: input.contentType, ResponseContentDisposition: contentDisposition(input.disposition, input.fileName) });
    try { return { url: await this.sign(this.client, command, { expiresIn: this.ttl(input.expiresAt) }), method: "GET", headers: {}, expiresAt: input.expiresAt }; } catch (error) { throw classifyS3Error(error); }
  }
  async deleteObject(input: { key: string; signal?: AbortSignal }): Promise<void> { try { await this.client.send(new DeleteObjectCommand({ Bucket: this.config.container, Key: this.key(input.key) }), { abortSignal: input.signal }); } catch (error) { const e = classifyS3Error(error); if (e.code !== "not-found") throw e; } }
}
