import type { StoredFile } from './types';

export type FileThumbnailKind =
  | 'archive'
  | 'audio'
  | 'code'
  | 'default'
  | 'document'
  | 'image'
  | 'json'
  | 'pdf'
  | 'presentation'
  | 'spreadsheet'
  | 'video';

export type NormalizedThumbnailFile = {
  extension: string;
  mimeType: string;
};

const archiveExtensions = new Set([
  '.7z',
  '.bz2',
  '.gz',
  '.rar',
  '.tar',
  '.tgz',
  '.zip',
]);
const documentExtensions = new Set([
  '.doc',
  '.docx',
  '.md',
  '.odt',
  '.rtf',
  '.txt',
]);
const spreadsheetExtensions = new Set(['.csv', '.ods', '.xls', '.xlsx']);
const presentationExtensions = new Set(['.odp', '.ppt', '.pptx']);
const jsonExtensions = new Set(['.json']);
const codeExtensions = new Set([
  '.css',
  '.htm',
  '.html',
  '.js',
  '.jsx',
  '.svg',
  '.ts',
  '.tsx',
  '.xml',
  '.yml',
  '.yaml',
]);
const activeContentExtensions = new Set([
  '.htm',
  '.html',
  '.svg',
  '.xml',
  '.xsl',
]);
const activeContentMimeTypes = new Set([
  'application/xml',
  'image/svg+xml',
  'text/html',
  'text/xml',
]);

export function normalizeFileThumbnailInput(
  file: StoredFile | File,
): NormalizedThumbnailFile {
  const extension = getNameExtension(file.name);
  const mimeType =
    ('contentType' in file ? file.contentType : file.type)
      ?.split(';', 1)[0]
      .trim()
      .toLowerCase() ?? '';
  return {
    extension,
    mimeType,
  };
}

export function classifyFileThumbnail({
  extension,
  mimeType,
}: NormalizedThumbnailFile): FileThumbnailKind {
  if (
    activeContentExtensions.has(extension) ||
    activeContentMimeTypes.has(mimeType) ||
    codeExtensions.has(extension)
  ) {
    return 'code';
  }
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType === 'application/pdf' || extension === '.pdf') return 'pdf';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType === 'application/json' || jsonExtensions.has(extension))
    return 'json';
  if (spreadsheetExtensions.has(extension)) return 'spreadsheet';
  if (presentationExtensions.has(extension)) return 'presentation';
  if (archiveExtensions.has(extension)) return 'archive';
  if (mimeType.startsWith('text/') || documentExtensions.has(extension))
    return 'document';
  return 'default';
}

function getNameExtension(value: string): string {
  const name = value.split(/[?#]/, 1)[0];
  const dotIndex = name.lastIndexOf('.');
  return dotIndex >= 0 ? name.slice(dotIndex).toLowerCase() : '';
}
