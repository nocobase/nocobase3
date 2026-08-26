import type { ComponentProps, ComponentType } from 'react';

import type { FilesUiContextValue } from '@/extensions/nocobase-files-provider-ui';

import { AudioPreviewer, VideoPreviewer } from './previewers/iframe';
import { ImagePreviewer } from './previewers/image';
import { OfficePreviewer } from './previewers/office';
import { PdfPreviewer } from './previewers/pdf';
import { MarkdownPreviewer, TextPreviewer } from './previewers/text';
import { UnsupportedPreviewer } from './previewers/unsupported';
import type { FilePreviewMessages, StoredFile } from './types';

export type FilePreviewFieldProps = Omit<ComponentProps<'div'>, 'children'> & {
  basePath: string;
  value: StoredFile[];
  size?: number;
  showFileName?: boolean;
  messages?: Partial<FilePreviewMessages>;
};

export type FilePreviewerProps = {
  basePath: string;
  buildFileUrl: FilesUiContextValue['buildFileUrl'];
  file: StoredFile;
  index: number;
  list: StoredFile[];
  messages: FilePreviewMessages;
  onDownload: (file: StoredFile) => void;
};

export type FilePreviewType = {
  key: string;
  match: (file: StoredFile) => boolean;
  Previewer: ComponentType<FilePreviewerProps>;
};

const officeExtensions = new Set([
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.odt',
  '.ods',
  '.odp',
]);
const officeMimeTypes = new Set([
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.spreadsheet',
  'application/vnd.oasis.opendocument.presentation',
]);
const activeContentExtensions = new Set([
  '.html',
  '.htm',
  '.xml',
  '.svg',
  '.xsl',
]);
const activeContentMimeTypes = new Set([
  'text/html',
  'application/xml',
  'text/xml',
  'image/svg+xml',
]);

export function getFileExtension(file: StoredFile): string {
  const name = file.name.split(/[?#]/, 1)[0];
  const dotIndex = name.lastIndexOf('.');
  return dotIndex >= 0 ? name.slice(dotIndex).toLowerCase() : '';
}

export function getFileMimeType(file: StoredFile): string {
  return file.contentType?.split(';', 1)[0].trim().toLowerCase() ?? '';
}

export function isOfficeFile(file: StoredFile): boolean {
  return (
    officeMimeTypes.has(getFileMimeType(file)) ||
    officeExtensions.has(getFileExtension(file))
  );
}

export function isImageFile(file: StoredFile): boolean {
  return (
    getFileMimeType(file).startsWith('image/') && !isActiveContentFile(file)
  );
}

export function isPdfFile(file: StoredFile): boolean {
  return (
    getFileMimeType(file) === 'application/pdf' ||
    getFileExtension(file) === '.pdf'
  );
}

export function isTextFile(file: StoredFile): boolean {
  const contentType = getFileMimeType(file);
  const extension = getFileExtension(file);
  return (
    contentType.startsWith('text/') ||
    contentType === 'application/json' ||
    extension === '.txt' ||
    extension === '.json'
  );
}

export function isMarkdownFile(file: StoredFile): boolean {
  return (
    getFileMimeType(file) === 'text/markdown' ||
    getFileExtension(file) === '.md'
  );
}

export function isAudioFile(file: StoredFile): boolean {
  return getFileMimeType(file).startsWith('audio/');
}

export function isVideoFile(file: StoredFile): boolean {
  return getFileMimeType(file).startsWith('video/');
}

export function isActiveContentFile(file: StoredFile): boolean {
  return (
    activeContentMimeTypes.has(getFileMimeType(file)) ||
    activeContentExtensions.has(getFileExtension(file))
  );
}

export const defaultPreviewTypes: readonly FilePreviewType[] = [
  { key: 'office', match: isOfficeFile, Previewer: OfficePreviewer },
  { key: 'image', match: isImageFile, Previewer: ImagePreviewer },
  { key: 'pdf', match: isPdfFile, Previewer: PdfPreviewer },
  { key: 'audio', match: isAudioFile, Previewer: AudioPreviewer },
  { key: 'video', match: isVideoFile, Previewer: VideoPreviewer },
  {
    key: 'markdown',
    match: (file) => isMarkdownFile(file) && !isActiveContentFile(file),
    Previewer: MarkdownPreviewer,
  },
  {
    key: 'text',
    match: (file) => isTextFile(file) && !isActiveContentFile(file),
    Previewer: TextPreviewer,
  },
  { key: 'unsupported', match: () => true, Previewer: UnsupportedPreviewer },
];

export function getPreviewType(file: StoredFile): FilePreviewType {
  const previewType = defaultPreviewTypes.find((candidate) =>
    candidate.match(file),
  );
  if (!previewType) {
    throw new Error('A Files preview type could not be resolved.');
  }
  return previewType;
}
