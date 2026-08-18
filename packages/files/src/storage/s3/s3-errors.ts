import { StorageDriverError } from "../storage-errors.ts";
export function classifyS3Error(error: unknown): StorageDriverError {
  const e = error as { name?: string; $metadata?: { httpStatusCode?: number; requestId?: string }; Code?: string };
  const code = e.name ?? e.Code;
  if (code === "NotFound" || code === "NoSuchKey" || e.$metadata?.httpStatusCode === 404) return new StorageDriverError("not-found", "object not found");
  if (e.$metadata?.httpStatusCode === 409 || code === "PreconditionFailed") return new StorageDriverError("conflict", "storage conflict");
  if (e.$metadata?.httpStatusCode && e.$metadata.httpStatusCode >= 500) return new StorageDriverError("unavailable", "storage unavailable");
  return new StorageDriverError("unavailable", "storage operation failed");
}
