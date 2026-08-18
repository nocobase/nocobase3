export type StorageDriverErrorCode = "not-found" | "invalid-key" | "conflict" | "size-mismatch" | "checksum-mismatch" | "aborted" | "unavailable" | "invalid-object";
export class StorageDriverError extends Error {
  constructor(readonly code: StorageDriverErrorCode, message: string = code, options?: ErrorOptions) { super(message, options); this.name = "StorageDriverError"; }
}
