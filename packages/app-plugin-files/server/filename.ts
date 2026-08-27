export const MAX_FILE_NAME_LENGTH: number = 128;

const FALLBACK_FILE_NAME = 'upload.bin';
const USEFUL_EXTENSION = /\.[A-Za-z0-9]{1,16}$/;

export function normalizeFileName(value: string): string {
  const basename = value.split(/[/\\]/).pop()?.trim() ?? '';
  const extension = basename.match(USEFUL_EXTENSION)?.[0] ?? '';
  const rawStem = extension ? basename.slice(0, -extension.length) : basename;
  const printableStem = Array.from(rawStem, (character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint >= 0x20 && codePoint <= 0x7e ? character : '-';
  }).join('');
  const safeStem = printableStem
    .replace(/[^A-Za-z0-9._\s-]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[._-]+|[._-]+$/g, '');

  if (!safeStem && !extension) {
    return FALLBACK_FILE_NAME;
  }

  const safeName = `${safeStem || 'upload'}${extension}`;
  if (safeName.length <= MAX_FILE_NAME_LENGTH) {
    return safeName;
  }

  const stemLength = MAX_FILE_NAME_LENGTH - extension.length;
  const stem = safeStem
    .slice(0, stemLength)
    .replace(/[._-]+$/g, '')
    .slice(0, stemLength);

  return `${stem || 'upload'}${extension}`.slice(0, MAX_FILE_NAME_LENGTH);
}
