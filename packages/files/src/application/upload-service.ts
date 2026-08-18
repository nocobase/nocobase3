import { createHash } from "node:crypto";
import { z } from "zod";
import { CreateUploadInputSchema, FILES_API_PREFIX, type CreateUploadInput, type CreateUploadResult, type JsonObject } from "../contracts/index.ts";
import { parseFilesConfig, type ValidatedFilesConfig } from "../config/index.ts";
import { authorizeFileAction, resolveFilesRequestContext } from "../authorization/index.ts";
import { FilesError } from "../errors/index.ts";
import { signTransferToken, verifyTransferToken } from "../security/index.ts";
import { StorageDriverError, validateObjectKey } from "../storage/index.ts";
import type { StorageDriverRegistry } from "../storage/index.ts";
import type { FilesStore, FileRecord, UploadRecord } from "../persistence/index.ts";
import { presentFile } from "./presenter.ts";
import type { ActorContext, FileAuthorizer, FileRequestContextResolver } from "../module-types.ts";

const MAX_NAME = 1024;
const MAX_CONTEXT = 16 * 1024;
const MIME = /^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+$/;
const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value as object).sort().map(k => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`).join(",")}}`;
  return JSON.stringify(value);
};
export const mimeMatches = (pattern: string, value: string) => {
  const [pt, ps] = pattern.toLowerCase().split("/"); const [vt, vs] = value.toLowerCase().split("/");
  return pattern === "*/*" || (pt === vt && (ps === "*" || ps === vs));
};
const normalizeName = (name: string) => {
  if (!name || name.length > MAX_NAME || /[\0-\u001f\u007f]/.test(name)) throw new FilesError("FILES_INVALID_REQUEST", "Invalid originalName");
  return name.normalize("NFC");
};
const contextValue = (context: unknown): JsonObject | undefined => {
  if (context === undefined) return undefined;
  const parsed = z.object({}).passthrough().safeParse(context);
  if (!parsed.success || JSON.stringify(parsed.data).length > MAX_CONTEXT) throw new FilesError("FILES_INVALID_REQUEST", "Invalid context");
  return parsed.data as JsonObject;
};
const fingerprint = (input: CreateUploadInput, policy: string) => createHash("sha256").update(canonical({ policy, originalName: input.originalName, contentType: input.contentType.toLowerCase(), size: input.size, checksum: input.checksum, context: input.context ?? null })).digest("hex");
const safeSegment = (workspaceId: string) => createHash("sha256").update(workspaceId).digest("hex").slice(0, 32);
const boundedBody = (body: ReadableStream<Uint8Array>, limit: number) => {
  const reader = body.getReader(); let size = 0;
  return new ReadableStream<Uint8Array>({ async pull(controller) { const item = await reader.read(); if (item.done) return controller.close(); size += item.value.byteLength; if (size > limit) { await reader.cancel(); return controller.error(new StorageDriverError("size-mismatch", "object size mismatch")); } controller.enqueue(item.value); }, cancel: reason => reader.cancel(reason) });
};

export interface UploadServiceOptions { config: ValidatedFilesConfig; store: FilesStore; registry: StorageDriverRegistry; requestContext: FileRequestContextResolver; authorizer: FileAuthorizer; now: () => Date; generateId: () => string }
export class UploadService {
  constructor(private readonly o: UploadServiceOptions) {}
  private policy(input: CreateUploadInput) { const name = input.policy ?? this.o.config.defaultPolicy; const policy = this.o.config.policies[name]; if (!policy) throw new FilesError("FILES_POLICY_NOT_FOUND", "Policy not found"); return [name, policy] as const; }
  async create(actor: ActorContext, workspaceId: string, key: string, raw: unknown): Promise<CreateUploadResult> {
    const input = CreateUploadInputSchema.parse(raw) as CreateUploadInput; const [policyName, policy] = this.policy(input);
    if (!Number.isSafeInteger(input.size) || input.size <= 0 || input.size > policy.maxSize) throw new FilesError("FILES_FILE_TOO_LARGE", "File exceeds policy limit");
    const contentType = input.contentType.trim().toLowerCase(); if (!MIME.test(contentType)) throw new FilesError("FILES_INVALID_REQUEST", "Invalid content type"); if (!policy.allowedContentTypes.some(p => mimeMatches(p, contentType))) throw new FilesError("FILES_CONTENT_TYPE_NOT_ALLOWED", "Content type is not allowed");
    const originalName = normalizeName(input.originalName); const context = contextValue(input.context);
    const checksumSha256 = input.checksum?.value.toLowerCase(); if (checksumSha256 && !/^[a-f0-9]{64}$/.test(checksumSha256)) throw new FilesError("FILES_INVALID_REQUEST", "Invalid SHA-256 checksum");
    await authorizeFileAction(this.o.authorizer, { action: "files.upload", policy: policyName, context }, { actor, workspaceId });
    const idempotency = key.trim(); if (!idempotency || idempotency.length > 256) throw new FilesError("FILES_INVALID_REQUEST", "Invalid Idempotency-Key");
    const expiresAt = new Date(this.o.now().getTime() + policy.uploadUrlTtlSeconds * 1000); const fileId = this.o.generateId(); const uploadId = this.o.generateId();
    const storageKey = validateObjectKey(`w/${safeSegment(workspaceId)}/objects/${fileId}`); const driver = this.o.registry.get(policy.backend); const prepared = await driver.prepareUpload({ key: storageKey, contentType, size: input.size, checksumSha256, expiresAt });
    const result = await this.o.store.createPendingUpload({ file: { id: fileId, workspaceId, backendKey: policy.backend, policy: policyName, storageKey, originalName, contentType, size: input.size, checksumSha256, accessContext: context, createdBy: actor.id }, upload: { id: uploadId, idempotencyKey: idempotency, requestFingerprint: fingerprint({ ...input, originalName, contentType, checksum: checksumSha256 ? { algorithm: "sha256", value: checksumSha256 } : undefined, context }, policyName), expiresAt, providerState: prepared.providerState } });
    const storedExpiry = result.upload.expiresAt; const token = prepared.mode === "proxy" ? signTransferToken({ version: 1, action: "upload", workspaceId, subjectId: result.upload.id, expectedSize: result.file.size, contentType: result.file.contentType, expiresAt: Math.floor(storedExpiry.getTime() / 1000) }, this.signingSecret(result.file.backendKey)) : undefined;
    const target = prepared.mode === "proxy" ? { mode: "proxy" as const, method: "PUT" as const, url: `${FILES_API_PREFIX}/uploads/${result.upload.id}/content?token=${encodeURIComponent(token!)}`, headers: { "Content-Type": result.file.contentType }, expiresAt: storedExpiry.toISOString() } : { mode: "presigned-put" as const, method: "PUT" as const, url: prepared.url, headers: prepared.headers, expiresAt: prepared.expiresAt.toISOString() };
    if (result.upload.status === "expired" || result.upload.expiresAt <= this.o.now()) throw new FilesError("FILES_UPLOAD_EXPIRED", "Upload has expired");
    return { uploadId: result.upload.id, fileId: result.file.id, expiresAt: result.upload.expiresAt.toISOString(), target };
  }
  private signingSecret(backend: string) { const b = this.o.config.backends[backend]; if (!b || b.driver !== "local") throw new FilesError("FILES_STORAGE_UNAVAILABLE", "Proxy signing is unavailable"); return b.signingSecret; }
  async proxy(workspaceId: string, uploadId: string, token: string, headers: Headers, body: ReadableStream<Uint8Array>) {
    let payload; try { for (const backend of Object.values(this.o.config.backends)) { if (backend.driver !== "local") continue; try { payload = verifyTransferToken(token, backend.signingSecret, { action: "upload", workspaceId, subjectId: uploadId }, () => Math.floor(this.o.now().getTime() / 1000)); break; } catch {} } if (!payload) throw new Error(); } catch { throw new FilesError("FILES_FORBIDDEN", "Invalid upload token"); }
    const upload = await this.o.store.getUpload(workspaceId, uploadId); if (!upload) throw new FilesError("FILES_UPLOAD_NOT_FOUND", "Upload not found"); if (upload.status !== "pending" || upload.cleanupStatus !== "pending") throw new FilesError(upload.status === "expired" || upload.cleanupStatus !== "pending" ? "FILES_UPLOAD_EXPIRED" : "FILES_CONFLICT", "Upload is not pending");
    if (new Date(upload.expiresAt) <= this.o.now()) throw new FilesError("FILES_UPLOAD_EXPIRED", "Upload has expired"); const file = await this.o.store.getFile(workspaceId, upload.fileId); if (!file) throw new FilesError("FILES_UPLOAD_NOT_FOUND", "Upload not found");
    if (payload.expectedSize !== file.size || payload.contentType !== file.contentType) throw new FilesError("FILES_FORBIDDEN", "Invalid upload token");
    if (headers.get("content-type")?.toLowerCase() !== file.contentType) throw new FilesError("FILES_CONTENT_TYPE_NOT_ALLOWED", "Content type is not allowed"); const length = headers.get("content-length"); if (length && Number(length) !== payload.expectedSize) throw new FilesError("FILES_FILE_SIZE_MISMATCH", "File size mismatch");
    const driver = this.o.registry.get(file.backendKey); if (!driver.putObject) throw new FilesError("FILES_STORAGE_UNAVAILABLE", "Proxy upload is unavailable");
    try { await driver.putObject({ key: file.storageKey, body: boundedBody(body, file.size), contentType: file.contentType, expectedSize: file.size, checksumSha256: file.checksumSha256 }); } catch (e) { if ((e as { code?: string }).code === "conflict") { const existing = await driver.statObject({ key: file.storageKey }); if (existing?.size === file.size && existing.contentType === file.contentType && (!file.checksumSha256 || existing.checksumSha256 === file.checksumSha256)) return; } if ((e as { code?: string }).code === "size-mismatch") { await this.o.store.failUpload(workspaceId, uploadId); throw new FilesError("FILES_FILE_SIZE_MISMATCH", "File size mismatch"); } if ((e as { code?: string }).code === "checksum-mismatch") { await this.o.store.failUpload(workspaceId, uploadId); throw new FilesError("FILES_CHECKSUM_MISMATCH", "Checksum mismatch"); } throw new FilesError("FILES_STORAGE_UNAVAILABLE", "Storage unavailable", { cause: e }); }
  }
  async complete(actor: ActorContext, workspaceId: string, uploadId: string) {
    const upload = await this.o.store.getUpload(workspaceId, uploadId); if (!upload) throw new FilesError("FILES_UPLOAD_NOT_FOUND", "Upload not found"); const file = await this.o.store.getFile(workspaceId, upload.fileId); if (!file || file.createdBy !== actor.id) throw new FilesError("FILES_FORBIDDEN", "Forbidden");
    await authorizeFileAction(this.o.authorizer, { action: "files.upload", policy: file.policy, context: file.accessContext, file: { id: file.id, policy: file.policy } }, { actor, workspaceId }); if (upload.status === "completed") return { file: presentFile(file) }; if (upload.status === "failed") throw new FilesError("FILES_CONFLICT", "Upload has failed"); if (upload.status === "expired" || new Date(upload.expiresAt) <= this.o.now() || upload.cleanupStatus !== "pending") throw new FilesError("FILES_UPLOAD_EXPIRED", "Upload has expired");
    const driver = this.o.registry.get(file.backendKey); const stat = await driver.statObject({ key: file.storageKey }); if (!stat) throw new FilesError("FILES_UPLOAD_INCOMPLETE", "Upload is incomplete");
    const reject = async (code: "FILES_FILE_SIZE_MISMATCH" | "FILES_CONTENT_TYPE_NOT_ALLOWED" | "FILES_CHECKSUM_MISMATCH", message: string): Promise<never> => { await this.o.store.failUpload(workspaceId, uploadId); await driver.deleteObject({ key: file.storageKey }); throw new FilesError(code, message); };
    if (stat.size !== file.size) return reject("FILES_FILE_SIZE_MISMATCH", "File size mismatch"); if (stat.contentType && stat.contentType.toLowerCase() !== file.contentType) return reject("FILES_CONTENT_TYPE_NOT_ALLOWED", "Content type mismatch"); if (file.checksumSha256 && stat.checksumSha256 !== file.checksumSha256) return reject("FILES_CHECKSUM_MISMATCH", "Checksum mismatch");
    return { file: presentFile(await this.o.store.completeUpload(workspaceId, uploadId, { size: stat.size, contentType: stat.contentType ?? file.contentType, checksumSha256: stat.checksumSha256 ?? file.checksumSha256 })) };
  }
}
