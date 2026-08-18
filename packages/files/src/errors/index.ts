import type { FilesErrorCode, FilesErrorEnvelope } from "../contracts/errors.ts";
export const FILES_ERROR_STATUS: Record<FilesErrorCode, number> = { FILES_INVALID_REQUEST: 400, FILES_POLICY_NOT_FOUND: 400, FILES_FILE_NOT_FOUND: 404, FILES_UPLOAD_NOT_FOUND: 404, FILES_FORBIDDEN: 403, FILES_FILE_TOO_LARGE: 413, FILES_CONTENT_TYPE_NOT_ALLOWED: 415, FILES_UPLOAD_EXPIRED: 410, FILES_UPLOAD_INCOMPLETE: 409, FILES_FILE_SIZE_MISMATCH: 409, FILES_CHECKSUM_MISMATCH: 409, FILES_IDEMPOTENCY_KEY_REUSED: 409, FILES_STORAGE_UNAVAILABLE: 503, FILES_CONFLICT: 409, FILES_INTERNAL_ERROR: 500 };
const RETRYABLE = new Set<FilesErrorCode>(["FILES_STORAGE_UNAVAILABLE"]);
export class FilesError extends Error { constructor(public readonly code: FilesErrorCode, message: string, options?: { details?: Record<string, unknown>; requestId?: string; cause?: unknown }) { super(message, { cause: options?.cause }); this.name = "FilesError"; this.details = options?.details; this.requestId = options?.requestId; } readonly details?: Record<string, unknown>; readonly requestId?: string; }
export function toFilesError(error: unknown): FilesError {
  if (error instanceof FilesError) return error;
  const message = error instanceof Error ? error.message : "";
  if (message === "FILES_INVALID_REQUEST") return new FilesError("FILES_INVALID_REQUEST", "Invalid request");
  if (message === "FILES_IDEMPOTENCY_KEY_REUSED") return new FilesError("FILES_IDEMPOTENCY_KEY_REUSED", "Idempotency-Key was reused with different input");
  const storageCode = typeof error === "object" && error && "code" in error ? String(error.code) : "";
  if (storageCode === "size-mismatch") return new FilesError("FILES_FILE_SIZE_MISMATCH", "File size mismatch", { cause: error });
  if (storageCode === "checksum-mismatch") return new FilesError("FILES_CHECKSUM_MISMATCH", "Checksum mismatch", { cause: error });
  if (["unavailable", "aborted"].includes(storageCode)) return new FilesError("FILES_STORAGE_UNAVAILABLE", "Storage unavailable", { cause: error });
  if (error instanceof SyntaxError) return new FilesError("FILES_INVALID_REQUEST", "Invalid JSON", { cause: error });
  if (message.includes("Invalid originalName") || message.includes("Invalid context")) return new FilesError("FILES_INVALID_REQUEST", message);
  if (typeof error === "object" && error && "issues" in error) return new FilesError("FILES_INVALID_REQUEST", "Invalid request", { cause: error });
  return new FilesError("FILES_INTERNAL_ERROR", "Internal server error", { cause: error });
}
export function filesErrorResponse(error: unknown, requestId?: string): { status: number; body: FilesErrorEnvelope } { const e = toFilesError(error); return { status: FILES_ERROR_STATUS[e.code], body: { error: { code: e.code, message: e.code === "FILES_INTERNAL_ERROR" ? "Internal server error" : e.message, retryable: RETRYABLE.has(e.code), requestId: e.requestId ?? requestId, ...(e.details ? { details: e.details as never } : {}) } } }; }
