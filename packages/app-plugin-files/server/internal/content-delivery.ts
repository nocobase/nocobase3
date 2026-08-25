import { invalidAccess } from './errors.js';
import type { FileRecord, PublicDisposition } from './model.js';

const DEFAULT_CONTENT_TYPE = 'application/octet-stream';
const INLINE_CONTENT_TYPES = new Set([
  'audio/mpeg',
  'audio/ogg',
  'application/pdf',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/plain',
  'video/mp4',
  'video/webm',
]);

export function resolveContentDisposition(
  record: FileRecord,
  disposition?: PublicDisposition,
): PublicDisposition {
  return (
    disposition ??
    (record.contentType !== null &&
    INLINE_CONTENT_TYPES.has(record.contentType.toLowerCase())
      ? 'inline'
      : 'attachment')
  );
}

export function assertInlineAllowed(
  contentType: string | null,
  disposition: PublicDisposition,
): void {
  if (
    disposition === 'inline' &&
    (contentType === null ||
      !INLINE_CONTENT_TYPES.has(contentType.toLowerCase()))
  ) {
    throw invalidAccess();
  }
}

export function createContentDisposition(
  disposition: PublicDisposition,
  name: string,
): string {
  const sourceName = name.replace(/\\/g, '/').split('/').pop() ?? 'file';
  const normalizedName =
    [...sourceName]
      .map((character) =>
        isSafeDispositionCharacter(character) ? character : '_',
      )
      .join('')
      .trim()
      .slice(0, 200) || 'file';
  const fallback =
    [...normalizedName]
      .map((character) =>
        isSafeFallbackCharacter(character) ? character : '_',
      )
      .join('')
      .replace(/[^\x20-\x7e]/g, '_')
      .trim()
      .slice(0, 150) || 'file';
  return `${disposition}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(
    normalizedName,
  ).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  )}`;
}

export function createContentHeaders(
  record: FileRecord,
  contentDisposition: string,
): Headers {
  return new Headers({
    'cache-control': 'private, no-store',
    'content-disposition': contentDisposition,
    'content-length': String(record.size ?? 0),
    'content-type': record.contentType ?? DEFAULT_CONTENT_TYPE,
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
  });
}

function isSafeDispositionCharacter(character: string): boolean {
  const code = character.charCodeAt(0);
  return code >= 32 && code !== 127;
}

function isSafeFallbackCharacter(character: string): boolean {
  const code = character.charCodeAt(0);
  return code >= 32 && code !== 127 && character !== '"' && character !== ';';
}
