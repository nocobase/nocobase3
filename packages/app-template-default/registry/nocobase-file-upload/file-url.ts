import { nocobaseClient } from '@nocobase/portal-sdk/client';

import { normalizeFileBasePath } from './base-path';
import type { StoredFile } from './types';

export function getFileName(file: StoredFile): string {
  return file.name || `file-${file.id}`;
}

export function getFileContentPath(basePath: string, file: StoredFile): string {
  return `${normalizeFileBasePath(basePath)}/${encodeURIComponent(file.id)}/content`;
}

export function getPreviewFileUrl(basePath: string, file: StoredFile): string {
  return nocobaseClient.buildUrl(getFileContentPath(basePath, file)).toString();
}

export function getDownloadUrl(basePath: string, file: StoredFile): string {
  return nocobaseClient
    .buildUrl(getFileContentPath(basePath, file), {
      disposition: 'attachment',
    })
    .toString();
}

export function getThumbnailUrl(basePath: string, file: StoredFile): string {
  return getPreviewFileUrl(basePath, file);
}

export function fetchFileContent(
  basePath: string,
  file: StoredFile,
  options: { signal?: AbortSignal; method?: 'GET' | 'HEAD' } = {},
): Promise<Response> {
  const method = options.method ?? 'GET';
  return fetch(
    nocobaseClient.buildUrl(
      getFileContentPath(basePath, file),
      method === 'HEAD' ? { disposition: 'attachment' } : undefined,
    ),
    {
      method,
      credentials: 'include',
      headers: nocobaseClient.getHeaders({ method: 'GET' }),
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
): Promise<void> {
  if (typeof document === 'undefined') return;
  await fetchFileContent(basePath, file, { method: 'HEAD' });
  const link = document.createElement('a');
  link.href = getDownloadUrl(basePath, file);
  link.download = getFileName(file);
  link.rel = 'noopener noreferrer';
  document.body.appendChild(link);
  link.click();
  link.remove();
}
