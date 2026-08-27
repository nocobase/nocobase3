export const MAX_FILE_NAME_LENGTH: number = 128;

const FALLBACK_FILE_NAME = 'upload.bin';
const USEFUL_EXTENSION = /\.[A-Za-z0-9]{1,16}$/u;
const CONTROL_CHARACTERS = /[\p{Cc}\p{Cf}]+/gu;
const UNSAFE_FILE_NAME_CHARACTERS = /[<>:"|?*]+/gu;

export function normalizeFileName(value: string): string {
  const basename = value
    .split(/[/\\]/u)
    .pop()
    ?.normalize('NFC')
    .replace(CONTROL_CHARACTERS, '-')
    .replace(UNSAFE_FILE_NAME_CHARACTERS, '-')
    .trim();
  if (!basename || basename === '.' || basename === '..') {
    return FALLBACK_FILE_NAME;
  }
  const extension = basename.match(USEFUL_EXTENSION)?.[0] ?? '';
  const rawStem = extension ? basename.slice(0, -extension.length) : basename;
  const safeStem = rawStem
    .replace(/\s+/gu, '-')
    .replace(/-+/gu, '-')
    .replace(/^[.\s_-]+|[.\s_-]+$/gu, '');

  if (!safeStem && !extension) {
    return FALLBACK_FILE_NAME;
  }

  const safeName = `${safeStem || 'upload'}${extension}`;
  if (Array.from(safeName).length <= MAX_FILE_NAME_LENGTH) {
    return safeName;
  }

  const stemLength = MAX_FILE_NAME_LENGTH - Array.from(extension).length;
  const stem = Array.from(safeStem)
    .slice(0, stemLength)
    .join('')
    .replace(/[.\s_-]+$/gu, '');

  return `${stem || 'upload'}${extension}`;
}

export function fileNameExtension(value: string): string {
  return normalizeFileName(value).match(USEFUL_EXTENSION)?.[0] ?? '';
}
