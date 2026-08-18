import type { FileStatus, JsonObject, UploadStatus } from "../contracts/index.ts";

export interface FilesTable {
  id: string;
  workspace_id: string;
  backend_key: string;
  policy: string;
  storage_key: string;
  original_name: string;
  content_type: string;
  size: number | string | bigint;
  checksum_sha256: string | null;
  status: FileStatus;
  access_context_json: string | null;
  created_by: string;
  created_at: Date | string;
  updated_at: Date | string;
  deleted_at: Date | string | null;
  storage_delete_status: "pending" | "processing" | "completed";
  storage_deleted_at: Date | string | null;
}

export interface FileUploadsTable {
  id: string;
  workspace_id: string;
  file_id: string;
  created_by: string;
  idempotency_key: string;
  request_fingerprint: string;
  status: UploadStatus;
  expires_at: Date | string;
  provider_state_json: string | null;
  created_at: Date | string;
  completed_at: Date | string | null;
  cleanup_status: "pending" | "processing" | "completed";
}

export interface FilesDatabase {
  files: FilesTable;
  file_uploads: FileUploadsTable;
}

export interface FileRecord {
  id: string; workspaceId: string; backendKey: string; policy: string; storageKey: string;
  originalName: string; contentType: string; size: number; checksumSha256?: string;
  status: FileStatus; accessContext?: JsonObject; createdBy: string; createdAt: Date; updatedAt: Date;
  deletedAt?: Date; storageDeleteStatus: "pending" | "processing" | "completed"; storageDeletedAt?: Date;
}

export interface UploadRecord {
  id: string; workspaceId: string; fileId: string; createdBy: string; idempotencyKey: string;
  requestFingerprint: string; status: UploadStatus; expiresAt: Date; providerState?: JsonObject;
  createdAt: Date; completedAt?: Date;
  cleanupStatus: "pending" | "processing" | "completed";
}
