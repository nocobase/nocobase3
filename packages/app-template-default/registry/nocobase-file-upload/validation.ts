import type {
  FileFieldDescriptor,
  FileStorageInfo,
  FileUploadMessages,
} from "./types";

export type FileValidationResult =
  | { valid: true }
  | { valid: false; code: "size" | "mimetype"; message: string };

export function resolveMaxFileSize(
  descriptor: FileFieldDescriptor,
  storage: FileStorageInfo
) {
  const storageSize = storage.rules?.size;
  const fieldSize = descriptor.maxSize;

  if (storageSize !== undefined && fieldSize !== undefined) {
    return Math.min(storageSize, fieldSize);
  }

  return storageSize ?? fieldSize;
}

function normalizeRules(rules?: string | string[]) {
  if (!rules) return [];

  return (Array.isArray(rules) ? rules : rules.split(","))
    .map((rule) => rule.trim().toLowerCase())
    .filter(Boolean);
}

export function matchesFileRules(file: File, rules?: string | string[]) {
  const normalized = normalizeRules(rules);
  if (!normalized.length) return true;

  const mimetype = file.type.toLowerCase();
  const filename = file.name.toLowerCase();

  return normalized.some((rule) => {
    if (rule === "*" || rule === "*/*") return true;
    if (rule.startsWith(".")) return filename.endsWith(rule);
    if (rule.endsWith("/*")) {
      return mimetype.startsWith(rule.slice(0, -1));
    }
    return mimetype === rule;
  });
}

export function validateFileBeforeUpload(
  file: File,
  descriptor: FileFieldDescriptor,
  storage: FileStorageInfo,
  messages: Pick<
    FileUploadMessages,
    "fileSizeExceeded" | "storageMimeTypeRejected" | "fieldMimeTypeRejected"
  >
): FileValidationResult {
  const maxSize = resolveMaxFileSize(descriptor, storage);

  if (maxSize !== undefined && file.size > maxSize) {
    return {
      valid: false,
      code: "size",
      message: messages.fileSizeExceeded(maxSize),
    };
  }

  if (!matchesFileRules(file, storage.rules?.mimetype)) {
    return {
      valid: false,
      code: "mimetype",
      message: messages.storageMimeTypeRejected,
    };
  }

  if (!matchesFileRules(file, descriptor.accept)) {
    return {
      valid: false,
      code: "mimetype",
      message: messages.fieldMimeTypeRejected,
    };
  }

  return { valid: true };
}

export function validateFileForField(
  file: File,
  descriptor: FileFieldDescriptor,
  messages: Pick<FileUploadMessages, "fileSizeExceeded" | "fieldMimeTypeRejected">
): FileValidationResult {
  if (descriptor.maxSize !== undefined && file.size > descriptor.maxSize) {
    return {
      valid: false,
      code: "size",
      message: messages.fileSizeExceeded(descriptor.maxSize),
    };
  }

  if (!matchesFileRules(file, descriptor.accept)) {
    return {
      valid: false,
      code: "mimetype",
      message: messages.fieldMimeTypeRejected,
    };
  }

  return { valid: true };
}

export function getAcceptAttribute(accept?: string | string[]) {
  if (!accept) return undefined;
  return Array.isArray(accept) ? accept.join(",") : accept;
}
