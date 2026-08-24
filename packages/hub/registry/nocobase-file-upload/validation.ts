import type { FileUploadMessages } from './types';

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
