import { FILES_API_PREFIX, CreateFileUrlInputSchema, type TemporaryFileUrl } from "../contracts/index.ts";
import { authorizeFileAction } from "../authorization/index.ts";
import type { ValidatedFilesConfig } from "../config/index.ts";
import { FilesError } from "../errors/index.ts";
import type { ActorContext, FileAuthorizer } from "../module-types.ts";
import type { FileRecord, FilesStore } from "../persistence/index.ts";
import { contentDisposition, signTransferToken, verifyTransferToken, type TransferTokenPayload } from "../security/index.ts";
import type { StorageDriverRegistry } from "../storage/index.ts";
import { presentFile } from "./presenter.ts";

export interface FileServiceOptions {
  config: ValidatedFilesConfig;
  store: FilesStore;
  registry: StorageDriverRegistry;
  authorizer: FileAuthorizer;
  now: () => Date;
  logger?: { error(error: unknown): void };
}

export class FileService {
  constructor(private readonly o: FileServiceOptions) {}

  private async visible(workspaceId: string, fileId: string): Promise<FileRecord> {
    const file = await this.o.store.getFile(workspaceId, fileId);
    if (!file) throw new FilesError("FILES_FILE_NOT_FOUND", "File not found");
    return file;
  }

  private authorize(action: "files.read" | "files.delete", actor: ActorContext, workspaceId: string, file: FileRecord) {
    return authorizeFileAction(this.o.authorizer, { action, policy: file.policy, context: file.accessContext, file: { id: file.id, policy: file.policy, status: file.status, createdBy: file.createdBy } }, { actor, workspaceId });
  }

  async get(actor: ActorContext, workspaceId: string, fileId: string) {
    const file = await this.visible(workspaceId, fileId);
    await this.authorize("files.read", actor, workspaceId, file);
    return presentFile(file);
  }

  async createUrl(actor: ActorContext, workspaceId: string, fileId: string, raw: unknown): Promise<TemporaryFileUrl> {
    const input = CreateFileUrlInputSchema.parse(raw);
    const file = await this.visible(workspaceId, fileId);
    await this.authorize("files.read", actor, workspaceId, file);
    if (file.status !== "ready") throw new FilesError("FILES_CONFLICT", "File is not ready");
    const policy = this.o.config.policies[file.policy];
    if (!policy) throw new FilesError("FILES_INTERNAL_ERROR", "Internal server error");
    const expiresIn = input.expiresIn ?? policy.defaultReadUrlTtlSeconds;
    if (expiresIn > policy.maxReadUrlTtlSeconds) throw new FilesError("FILES_INVALID_REQUEST", "expiresIn exceeds policy maximum");
    const disposition = input.disposition ?? "inline";
    const expiresAtSeconds = Math.floor(this.o.now().getTime() / 1000) + expiresIn;
    const expiresAt = new Date(expiresAtSeconds * 1000);
    const backend = this.o.config.backends[file.backendKey];
    const driver = this.o.registry.get(file.backendKey);
    if (backend?.driver === "local") {
      const token = signTransferToken({ version: 1, action: "read", workspaceId, subjectId: file.id, expiresAt: expiresAtSeconds, disposition }, backend.signingSecret);
      return { url: `${FILES_API_PREFIX}/delivery/${file.id}?token=${encodeURIComponent(token)}`, expiresAt: expiresAt.toISOString(), method: "GET", headers: {} };
    }
    if (!driver.createExternalReadTarget) throw new FilesError("FILES_STORAGE_UNAVAILABLE", "Storage unavailable");
    try {
      const target = await driver.createExternalReadTarget({ key: file.storageKey, fileName: file.originalName, contentType: file.contentType, disposition, expiresAt });
      return { url: target.url, expiresAt: target.expiresAt.toISOString(), method: target.method, headers: target.headers };
    } catch (error) {
      throw new FilesError("FILES_STORAGE_UNAVAILABLE", "Storage unavailable", { cause: error });
    }
  }

  private verifyReadToken(fileId: string, token: string): TransferTokenPayload {
    if (token.length > 4096) throw new FilesError("FILES_FORBIDDEN", "Invalid delivery token");
    let workspaceId = "";
    try {
      const body = token.split(".")[0];
      if (!body) throw new Error();
      const decoded = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { workspaceId?: unknown };
      if (typeof decoded.workspaceId !== "string" || !decoded.workspaceId) throw new Error();
      workspaceId = decoded.workspaceId;
    } catch {
      throw new FilesError("FILES_FORBIDDEN", "Invalid delivery token");
    }
    for (const backend of Object.values(this.o.config.backends)) {
      if (backend.driver !== "local") continue;
      try {
        const payload = verifyTransferToken(token, backend.signingSecret, { action: "read", workspaceId, subjectId: fileId }, () => Math.floor(this.o.now().getTime() / 1000));
        if (payload.disposition !== "inline" && payload.disposition !== "attachment") throw new Error();
        return payload;
      } catch {}
    }
    throw new FilesError("FILES_FORBIDDEN", "Invalid delivery token");
  }

  async deliver(fileId: string, token: string, signal?: AbortSignal): Promise<{ body: ReadableStream<Uint8Array>; headers: Headers }> {
    const payload = this.verifyReadToken(fileId, token);
    const file = await this.o.store.getFile(payload.workspaceId, fileId);
    const backend = file && this.o.config.backends[file.backendKey];
    if (!file || file.status !== "ready" || backend?.driver !== "local") throw new FilesError("FILES_FILE_NOT_FOUND", "File not found");
    try { verifyTransferToken(token, backend.signingSecret, { action: "read", workspaceId: payload.workspaceId, subjectId: fileId }, () => Math.floor(this.o.now().getTime() / 1000)); }
    catch { throw new FilesError("FILES_FILE_NOT_FOUND", "File not found"); }
    const driver = this.o.registry.get(file.backendKey);
    if (!driver.openRead) throw new FilesError("FILES_STORAGE_UNAVAILABLE", "Storage unavailable");
    let opened;
    try { opened = await driver.openRead({ key: file.storageKey, signal }); }
    catch (error) { throw new FilesError("FILES_STORAGE_UNAVAILABLE", "Storage unavailable", { cause: error }); }
    if (opened.stat.size !== file.size) {
      await opened.body.cancel().catch(() => undefined);
      this.o.logger?.error(new Error(`Stored object size mismatch for file ${file.id}`));
      throw new FilesError("FILES_FILE_SIZE_MISMATCH", "Stored file size mismatch");
    }
    const remaining = Math.max(0, payload.expiresAt - Math.floor(this.o.now().getTime() / 1000));
    return { body: opened.body, headers: new Headers({ "Content-Type": file.contentType, "Content-Length": String(file.size), "Content-Disposition": contentDisposition(payload.disposition!, file.originalName), "Cache-Control": `private, max-age=${remaining}`, "X-Content-Type-Options": "nosniff" }) };
  }

  async delete(actor: ActorContext, workspaceId: string, fileId: string): Promise<void> {
    const file = await this.o.store.getFile(workspaceId, fileId, { includeDeleted: true });
    if (!file) throw new FilesError("FILES_FILE_NOT_FOUND", "File not found");
    await this.authorize("files.delete", actor, workspaceId, file);
    if (file.status === "deleted") return;
    const { file: deleted, newlyDeleted } = await this.o.store.markFileDeleted(workspaceId, fileId, actor.id, this.o.now());
    if (!newlyDeleted) return;
    try {
      await this.o.registry.get(deleted.backendKey).deleteObject({ key: deleted.storageKey });
      await this.o.store.markPhysicalDeleteCompleted(workspaceId, fileId, this.o.now());
    } catch (error) {
      this.o.logger?.error(error);
    }
  }
}
