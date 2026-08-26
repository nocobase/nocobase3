import type { FileUploadItem, FileUploadMessages, StoredFile } from './types';

export type FileValidationResult =
  { valid: true } | { valid: false; code: 'size' | 'type'; message: string };

export function validateFile(
  file: File,
  options: {
    maxBytes?: number;
    accept?: string | readonly string[];
    messages: Pick<FileUploadMessages, 'fileSizeExceeded' | 'fileTypeRejected'>;
  },
): FileValidationResult {
  if (options.maxBytes !== undefined && file.size > options.maxBytes) {
    return {
      valid: false,
      code: 'size',
      message: options.messages.fileSizeExceeded(options.maxBytes),
    };
  }
  if (!matchesFileRules(file, options.accept)) {
    return {
      valid: false,
      code: 'type',
      message: options.messages.fileTypeRejected,
    };
  }
  return { valid: true };
}

export function matchesFileRules(
  file: File,
  accept?: string | readonly string[],
): boolean {
  const rules = normalizeRules(accept);
  if (!rules.length) return true;

  const contentType = file.type.toLowerCase();
  const filename = file.name.toLowerCase();
  return rules.some((rule) => {
    if (rule === '*' || rule === '*/*') return true;
    if (rule.startsWith('.')) return filename.endsWith(rule);
    if (rule.endsWith('/*')) return contentType.startsWith(rule.slice(0, -1));
    return contentType === rule;
  });
}

export interface FileFieldValidationOptions {
  readonly accept?: string | readonly string[];
  readonly disabled?: boolean;
  readonly items: readonly FileUploadItem[];
  readonly maxBytes?: number;
  readonly maxFiles?: number;
  readonly messages: Pick<
    FileUploadMessages,
    | 'fileNotReady'
    | 'fileSizeExceeded'
    | 'fileTypeRejected'
    | 'maximumFiles'
    | 'minimumFiles'
    | 'required'
    | 'uploadFailedValidation'
    | 'uploadInProgress'
  >;
  readonly minimum: number;
  readonly readOnly?: boolean;
  readonly required?: boolean;
  readonly value: readonly StoredFile[];
}

export function validateFileField(
  options: FileFieldValidationOptions,
): string | null {
  if (options.disabled || options.readOnly) return null;
  if (options.items.some(isActiveItem)) {
    return options.messages.uploadInProgress;
  }
  if (options.items.some((item) => item.status === 'error')) {
    return options.messages.uploadFailedValidation;
  }
  if (options.value.length < options.minimum) {
    return options.required && options.value.length === 0
      ? options.messages.required
      : options.messages.minimumFiles(options.minimum);
  }
  if (
    options.maxFiles !== undefined &&
    options.value.length > options.maxFiles
  ) {
    return options.messages.maximumFiles(options.maxFiles);
  }
  for (const file of options.value) {
    if (file.status !== 'ready') return options.messages.fileNotReady;
    if (
      options.maxBytes !== undefined &&
      file.size !== null &&
      file.size > options.maxBytes
    ) {
      return options.messages.fileSizeExceeded(options.maxBytes);
    }
    if (!matchesStoredFileRules(file, options.accept)) {
      return options.messages.fileTypeRejected;
    }
  }
  return null;
}

export function getAcceptAttribute(
  accept?: string | readonly string[],
): string | undefined {
  if (!accept) return undefined;
  return typeof accept === 'string' ? accept : accept.join(',');
}

function normalizeRules(
  accept?: string | readonly string[],
): readonly string[] {
  if (!accept) return [];
  const values = typeof accept === 'string' ? accept.split(',') : accept;
  return values.map((rule) => rule.trim().toLowerCase()).filter(Boolean);
}

function matchesStoredFileRules(
  file: Pick<StoredFile, 'contentType' | 'name'>,
  accept?: string | readonly string[],
): boolean {
  const rules = normalizeRules(accept);
  if (!rules.length) return true;
  const contentType = file.contentType?.toLowerCase() ?? '';
  const filename = file.name.toLowerCase();
  return rules.some((rule) => {
    if (rule === '*' || rule === '*/*') return true;
    if (rule.startsWith('.')) return filename.endsWith(rule);
    if (rule.endsWith('/*')) return contentType.startsWith(rule.slice(0, -1));
    return contentType === rule;
  });
}

function isActiveItem(item: FileUploadItem): boolean {
  return (
    item.status === 'queued' ||
    item.status === 'uploading' ||
    item.status === 'completing'
  );
}
