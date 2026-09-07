import type {
  CreateFilesClientOptions,
  FileAccessUrl,
  FileRecord,
  FilesClient,
  FileUploadOptions,
} from './types.js';

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
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(value)) {
    throw new FilesClientError(
      'Files client endpoint must be relative to the application API root.',
    );
  }
  if (/[?#]/u.test(value)) {
    throw new FilesClientError(
      'Files client endpoint must not contain a query string or fragment.',
    );
  }
  const normalized = value.replace(/^\/+|\/+$/gu, '');
  if (!normalized) {
    throw new FilesClientError('Files client endpoint is required.');
  }
  const segments = normalized.split('/');
  for (const [index, segment] of segments.entries()) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(segment);
    } catch {
      throw new FilesClientError(
        'Files client endpoint contains invalid URL encoding.',
      );
    }
    if (!decoded || decoded === '.' || decoded === '..') {
      throw new FilesClientError(
        'Files client endpoint must not contain empty or relative path segments.',
      );
    }
    if (decoded.includes('/') || decoded.includes('\\')) {
      throw new FilesClientError(
        'Files client endpoint must not contain encoded path separators.',
      );
    }
    if (index === 0 && decoded === 'api') {
      throw new FilesClientError(
        'Files client endpoint is relative to /api and must not include the api prefix.',
      );
    }
  }
  return normalized;
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
    const textPayload =
      typeof payload === 'string' && payload.trim() ? payload : undefined;
    const code =
      typeof value.code === 'string'
        ? value.code
        : typeof nested?.code === 'string'
          ? nested.code
          : typeof detail?.code === 'string'
            ? detail.code
            : undefined;
    const serverMessage =
      textPayload ??
      (typeof nested?.message === 'string'
        ? nested.message
        : typeof detail?.message === 'string'
          ? detail.message
          : typeof value.message === 'string'
            ? value.message
            : 'Files request failed.');
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
  const endpoint = normalizeEndpoint(options.endpoint);

  async function request<T>(
    path: string,
    requestOptions: {
      method: 'GET' | 'POST' | 'DELETE';
      body?: unknown;
      allowNoContent?: boolean;
      signal?: AbortSignal;
    },
  ): Promise<T> {
    try {
      const payload = await options.api.request<unknown>({
        path,
        method: requestOptions.method,
        ...(typeof FormData !== 'undefined' &&
        requestOptions.body instanceof FormData
          ? { body: requestOptions.body }
          : requestOptions.body === undefined
            ? {}
            : { json: requestOptions.body }),
        signal: requestOptions.signal,
      });
      if (requestOptions.allowNoContent && payload === undefined) {
        return undefined as T;
      }
      if (!payload || typeof payload !== 'object' || !('data' in payload)) {
        throw new FilesClientError(
          'Files response is missing its data envelope.',
        );
      }
      return (payload as { data: T }).data;
    } catch (error) {
      if (isAbortError(error)) throw error;
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
      return records;
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
        signal: uploadOptions?.signal,
      });
      return record;
    },
    async get(id: string): Promise<FileRecord> {
      const record = await request<FileRecord>(
        joinEndpoint(endpoint, encodeId(id)),
        {
          method: 'GET',
        },
      );
      return record;
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
      return access;
    },
    async remove(id: string): Promise<void> {
      await request<void>(joinEndpoint(endpoint, encodeId(id)), {
        method: 'DELETE',
        allowNoContent: true,
      });
    },
  };
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    error.name === 'AbortError'
  );
}
