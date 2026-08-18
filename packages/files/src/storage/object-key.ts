import path from "node:path";
import { StorageDriverError } from "./storage-errors.ts";

const MAX_KEY_LENGTH = 1024;
export function validateObjectKey(key: string): string {
  if (typeof key !== "string" || key.length === 0 || key.length > MAX_KEY_LENGTH || key.startsWith("/") || key.includes("\\") || key.includes("\0") || /[\u0000-\u001f\u007f]/.test(key)) throw new StorageDriverError("invalid-key", "invalid object key");
  const parts = key.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) throw new StorageDriverError("invalid-key", "invalid object key");
  if (path.posix.normalize(key) !== key || path.posix.normalize(key).startsWith("../")) throw new StorageDriverError("invalid-key", "invalid object key");
  return key;
}
