import type {
  CreateFilesClientOptions,
  FileAccessUrl,
  FileRecord,
  FilesClient,
  FileUploadOptions,
} from './types.js';

import { nocobaseClient } from '@nocobase/app-portal-sdk/client';
import { resolvePortalUrl } from '@nocobase/app-portal-sdk/runtime';

declare global {
  interface Window {
    NOCOBASE_API_URL?: string;
    NOCOBASE_PORTAL_BASE?: string;
    NOCOBASE_WS_PATH?: string;
    NOCOBASE_WS_URL?: string;
  }
}

export class FilesClientError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly serverMessage: string;

  constructor(
    message: string,
    options: { status?: number; code?: string; serverMessage?: string } = {},
  ) {
    super(message);
    this.name = 'FilesClientError';
    this.status = options.status ?? 0;
    this.code = options.code;
    this.serverMessage = options.serverMessage ?? message;
  }
}

function normalizeEndpoint(endpoint: string): string {
  const value = endpoint.trim();
  if (!value) throw new FilesClientError('Files client endpoint is required.');
  return value.replace(/\/+$/, '') || '/';
}

function resolveEndpoint(endpoint: string): string {
  if (/^(?:https?:)?\/\//i.test(endpoint)) {
    return resolveSameOriginEndpoint(endpoint);
  }
  if (/^[a-z][a-z\d+.-]*:/i.test(endpoint)) {
    throw new FilesClientError(
      'Files client endpoint must use a same-origin HTTP(S) URL.',
    );
  }
  return ensureSameOrigin(resolvePortalResourceUrl(endpoint));
}

function resolveSameOriginEndpoint(endpoint: string): string {
  if (typeof window === 'undefined') {
    throw new FilesClientError(
      'Absolute Files client endpoints require a browser origin.',
    );
  }
  return ensureSameOrigin(new URL(endpoint, window.location.origin).toString());
}

function ensureSameOrigin(endpoint: string): string {
  if (typeof window === 'undefined') {
    if (/^(?:https?:)?\/\//i.test(endpoint)) {
      throw new FilesClientError(
        'Absolute Files client endpoints require a browser origin.',
      );
    }
    return endpoint;
  }
  const resolved = new URL(endpoint, window.location.origin);
  if (resolved.origin !== window.location.origin) {
    throw new FilesClientError(
      'Files client endpoint must use the current application origin.',
    );
  }
  return resolved.toString();
}

function resolvePortalResourceUrl(path: string): string {
  if (/^[a-z][a-z\d+.-]*:/i.test(path)) return path;
  const resolved = resolvePortalUrl(path);
  if (typeof window === 'undefined') return resolved;

  const portalRoot = new URL(resolvePortalUrl('/'), window.location.origin);
  const absolute = new URL(path, window.location.origin);
  const portalBasePath = portalRoot.pathname.replace(/\/+$/, '');
  if (
    path.startsWith('/') &&
    portalBasePath &&
    (absolute.pathname === portalBasePath ||
      absolute.pathname.startsWith(`${portalBasePath}/`))
  ) {
    return absolute.toString();
  }
  return new URL(resolved, window.location.origin).toString();
}

function resolveContentUrl(url: string): string {
  return resolvePortalResourceUrl(url);
}

function resolveFileRecord(record: FileRecord): FileRecord {
  return {
    ...record,
    contentUrl: resolveContentUrl(record.contentUrl),
  };
}

function resolveAccessUrl(access: FileAccessUrl): FileAccessUrl {
  return {
    ...access,
    url: resolveContentUrl(access.url),
  };
}

function joinEndpoint(endpoint: string, suffix = ''): string {
  return suffix ? `${endpoint}/${suffix.replace(/^\/+/, '')}` : endpoint;
}

function encodeId(id: string): string {
  return encodeURIComponent(id);
}

function toClientError(error: unknown): FilesClientError {
  if (error instanceof FilesClientError) return error;
  if (error && typeof error === 'object') {
    const value = error as {
      status?: unknown;
      code?: unknown;
      message?: unknown;
      payload?: unknown;
    };
    const payload = value.payload;
    const detail =
      payload && typeof payload === 'object'
        ? (payload as {
            code?: unknown;
            message?: unknown;
            error?: { code?: unknown; message?: unknown };
          })
        : undefined;
    const nested = detail?.error;
    const code =
      typeof value.code === 'string'
        ? value.code
        : typeof nested?.code === 'string'
          ? nested.code
          : typeof detail?.code === 'string'
            ? detail.code
            : undefined;
    const serverMessage =
      typeof nested?.message === 'string'
        ? nested.message
        : typeof detail?.message === 'string'
          ? detail.message
          : typeof value.message === 'string'
            ? value.message
            : 'Files request failed.';
    return new FilesClientError(serverMessage, {
      status: typeof value.status === 'number' ? value.status : undefined,
      code,
      serverMessage,
    });
  }
  return new FilesClientError('Files request failed.');
}

export function createFilesClient(
  options: CreateFilesClientOptions,
): FilesClient {
  const endpoint = resolveEndpoint(normalizeEndpoint(options.endpoint)).replace(
    /\/+$/,
    '',
  );

  async function request<T>(
    path: string,
    requestOptions: {
      method: 'GET' | 'POST' | 'DELETE';
      body?: unknown;
      allowNoContent?: boolean;
    },
  ): Promise<T> {
    try {
      const headers = nocobaseClient.getHeaders({
        method: requestOptions.method,
        body: requestOptions.body,
      });
      const response = await fetch(path, {
        method: requestOptions.method,
        headers,
        credentials: 'include',
        body:
          requestOptions.body === undefined
            ? undefined
            : requestOptions.body instanceof FormData
              ? requestOptions.body
              : JSON.stringify(requestOptions.body),
      });
      const renewedToken = response.headers.get('x-new-token');
      if (renewedToken) nocobaseClient.setToken(renewedToken);
      const text = await response.text();
      let payload: unknown;
      try {
        payload = text ? JSON.parse(text) : undefined;
      } catch {
        payload = text;
      }
      if (!response.ok) {
        const detail =
          payload && typeof payload === 'object'
            ? (payload as {
                code?: unknown;
                message?: unknown;
                error?: { code?: unknown; message?: unknown };
              })
            : undefined;
        const nested = detail?.error;
        const code =
          typeof nested?.code === 'string'
            ? nested.code
            : typeof detail?.code === 'string'
              ? detail.code
              : undefined;
        const serverMessage =
          typeof payload === 'string'
            ? payload
            : typeof nested?.message === 'string'
              ? nested.message
              : typeof detail?.message === 'string'
                ? detail.message
                : `Files request failed (${response.status}).`;
        throw new FilesClientError(serverMessage, {
          status: response.status,
          code,
          serverMessage,
        });
      }
      if (requestOptions.allowNoContent && response.status === 204) {
        return undefined as T;
      }
      if (!payload || typeof payload !== 'object' || !('data' in payload)) {
        throw new FilesClientError(
          'Files response is missing its data envelope.',
          {
            status: response.status,
          },
        );
      }
      return (payload as { data: T }).data;
    } catch (error) {
      throw toClientError(error);
    }
  }

  return {
    async list(): Promise<readonly FileRecord[]> {
      const records = await request<readonly FileRecord[]>(
        joinEndpoint(endpoint),
        {
          method: 'GET',
        },
      );
      return records.map(resolveFileRecord);
    },
    async upload(
      file: File,
      uploadOptions?: FileUploadOptions,
    ): Promise<FileRecord> {
      const body = new FormData();
      body.append('file', file, file.name);
      if (uploadOptions?.public !== undefined) {
        body.append('public', String(uploadOptions.public));
      }
      const record = await request<FileRecord>(joinEndpoint(endpoint), {
        method: 'POST',
        body,
      });
      return resolveFileRecord(record);
    },
    async get(id: string): Promise<FileRecord> {
      const record = await request<FileRecord>(
        joinEndpoint(endpoint, encodeId(id)),
        {
          method: 'GET',
        },
      );
      return resolveFileRecord(record);
    },
    async createAccessUrl(
      id: string,
      expiresIn?: number,
    ): Promise<FileAccessUrl> {
      const body = expiresIn === undefined ? undefined : { expiresIn };
      const access = await request<FileAccessUrl>(
        joinEndpoint(endpoint, `${encodeId(id)}/token`),
        {
          method: 'POST',
          body,
        },
      );
      return resolveAccessUrl(access);
    },
    async remove(id: string): Promise<void> {
      await request<void>(joinEndpoint(endpoint, encodeId(id)), {
        method: 'DELETE',
        allowNoContent: true,
      });
    },
  };
}
