import type { FileStorageInfo, FileUploadMode } from "./types";

const CURRENT_DIRECT_UPLOAD_STORAGE_TYPES = new Set(["s3-compatible"]);

export function resolveFileUploadMode(
  storage: FileStorageInfo,
  requestedMode: FileUploadMode = "auto"
): Exclude<FileUploadMode, "auto"> {
  if (requestedMode !== "auto") return requestedMode;
  if (storage.clientUpload !== undefined) {
    return storage.clientUpload ? "direct" : "multipart";
  }

  return CURRENT_DIRECT_UPLOAD_STORAGE_TYPES.has(storage.type)
    ? "direct"
    : "multipart";
}

export function getAvailableFileCount(
  limit: number | undefined,
  committedCount: number,
  reservedCount: number,
  requestedCount: number
) {
  if (limit === undefined) return requestedCount;
  return Math.max(
    0,
    Math.min(requestedCount, limit - committedCount - reservedCount)
  );
}
