import type { JsonObject } from "../contracts/index.ts";
import type { FileRecord, UploadRecord } from "./database-types.ts";

export interface CreatePendingUploadInput { file: { id: string; workspaceId: string; backendKey: string; policy: string; storageKey: string; originalName: string; contentType: string; size: number; checksumSha256?: string; accessContext?: JsonObject; createdBy: string }; upload: { id: string; idempotencyKey: string; requestFingerprint: string; expiresAt: Date; providerState?: JsonObject } }
export type CreatePendingUploadResult = { kind: "created" | "replayed"; file: FileRecord; upload: UploadRecord };
export interface VerifiedObject { contentType: string; size: number; checksumSha256?: string }
export interface FilesStore {
  createPendingUpload(input: CreatePendingUploadInput): Promise<CreatePendingUploadResult>;
  getFile(workspaceId: string, fileId: string, options?: { includeDeleted?: boolean }): Promise<FileRecord | undefined>;
  getUpload(workspaceId: string, uploadId: string): Promise<UploadRecord | undefined>;
  updateUploadProviderState(workspaceId: string, uploadId: string, expectedStatus: "pending", state: JsonObject): Promise<UploadRecord>;
  completeUpload(workspaceId: string, uploadId: string, verifiedObject: VerifiedObject): Promise<FileRecord>;
  failUpload(workspaceId: string, uploadId: string, reasonMetadata?: JsonObject): Promise<UploadRecord>;
  listExpiredPendingUploads(now: Date, limit: number): Promise<UploadRecord[]>;
  expireUpload(workspaceId: string, uploadId: string, now: Date): Promise<UploadRecord>;
  claimExpiredUpload(workspaceId: string, uploadId: string, now: Date): Promise<{ upload: UploadRecord; file: FileRecord } | undefined>;
  releaseExpiredUploadClaim(workspaceId: string, uploadId: string): Promise<void>;
  completeExpiredUploadCleanup(workspaceId: string, uploadId: string, now: Date): Promise<void>;
  markFileDeleted(workspaceId: string, fileId: string, actorId: string, now: Date): Promise<{ file: FileRecord; newlyDeleted: boolean }>;
  listFilesPendingPhysicalDelete(limit: number): Promise<FileRecord[]>;
  claimFilePendingPhysicalDelete(workspaceId: string, fileId: string): Promise<FileRecord | undefined>;
  releaseFilePhysicalDeleteClaim(workspaceId: string, fileId: string): Promise<void>;
  markPhysicalDeleteCompleted(workspaceId: string, fileId: string, now: Date): Promise<FileRecord>;
}
