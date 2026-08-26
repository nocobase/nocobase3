import {
  defaultFilesUiContextValue,
  type FilesUiContextValue,
} from '@/extensions/nocobase-files-provider-ui';

import { normalizeFileBasePath } from './base-path';
import type { StoredFile } from './types';

type FileUrlBuilder = FilesUiContextValue['buildFileUrl'];

export function getFileName(file: StoredFile): string {
  return file.name || `file-${file.id}`;
}

export function getFileContentPath(basePath: string, file: StoredFile): string {
  return `${normalizeFileBasePath(basePath)}/${encodeURIComponent(file.id)}/content`;
}

export function getPreviewFileUrl(
  basePath: string,
  file: StoredFile,
  buildFileUrl: FileUrlBuilder = defaultFilesUiContextValue.buildFileUrl,
): string {
  return buildFileUrl(getFileContentPath(basePath, file));
}

export function getDownloadUrl(
  basePath: string,
  file: StoredFile,
  buildFileUrl: FileUrlBuilder = defaultFilesUiContextValue.buildFileUrl,
): string {
  return buildFileUrl(getFileContentPath(basePath, file), {
    disposition: 'attachment',
  });
}

export function getThumbnailUrl(
  basePath: string,
  file: StoredFile,
  buildFileUrl: FileUrlBuilder = defaultFilesUiContextValue.buildFileUrl,
): string {
  return getPreviewFileUrl(basePath, file, buildFileUrl);
}

export function fetchFileContent(
  basePath: string,
  file: StoredFile,
  options: { signal?: AbortSignal; method?: 'GET' | 'HEAD' } = {},
  buildFileUrl: FileUrlBuilder = defaultFilesUiContextValue.buildFileUrl,
): Promise<Response> {
  const method = options.method ?? 'GET';
  return fetch(
    buildFileUrl(
      getFileContentPath(basePath, file),
      method === 'HEAD' ? { disposition: 'attachment' } : undefined,
    ),
    {
      method,
      credentials: 'same-origin',
      signal: options.signal,
    },
  ).then((response) => {
    if (!response.ok) {
      throw new Error(`Unable to load file (${response.status})`);
    }
    return response;
  });
}

export async function triggerFileDownload(
  basePath: string,
  file: StoredFile,
  buildFileUrl: FileUrlBuilder = defaultFilesUiContextValue.buildFileUrl,
): Promise<void> {
  if (typeof document === 'undefined') return;
  await fetchFileContent(basePath, file, { method: 'HEAD' }, buildFileUrl);
  const link = document.createElement('a');
  link.href = getDownloadUrl(basePath, file, buildFileUrl);
  link.download = getFileName(file);
  link.rel = 'noopener noreferrer';
  document.body.appendChild(link);
  link.click();
  link.remove();
}
