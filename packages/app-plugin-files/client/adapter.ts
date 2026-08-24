import type {
  CreateBusinessFileRequest,
  CreateBusinessFileResponse,
  FileDisposition,
  FileOperationResponse,
  FileResponse,
  PublicFileAccessRequest,
  PublicFileAccessResponse,
  StoredFile,
} from '../protocol.js';
import { FileClientError, toFileClientError } from './error.js';
import { executeFileUploadPlan } from './runtime.js';
import type {
  CreateFileAdapterOptions,
  FileAdapterItem,
  FileAdapterUploadOptions,
  FileClientOperation,
  FilePublicAccessResult,
  FileUploadAdapter,
} from './types.js';

export function createFileAdapter(
  options: CreateFileAdapterOptions,
): FileUploadAdapter {
  const basePath = normalizeBasePath(options.basePath);
  const itemPath = (fileId: string): string =>
    `${basePath}/${encodeURIComponent(readFileId(fileId))}`;

  const request = async <T>(
    path: string,
    operation: FileClientOperation,
    init?: RequestInit,
  ): Promise<T> => {
    try {
      return await options.client.request<T>(path, init);
    } catch (error) {
      throw toFileClientError(error, operation, 'The file request failed.');
    }
  };

  const upload = async (
    file: File,
    uploadOptions: FileAdapterUploadOptions = {},
    replaceFileId?: string,
  ): Promise<FileAdapterItem> => {
    if (uploadOptions.signal?.aborted) {
      throw new FileClientError('File upload was aborted.', {
        code: 'UPLOAD_ABORTED',
        status: 0,
        operation: 'create',
      });
    }
    const createBody: CreateBusinessFileRequest = {
      name: file.name,
      size: file.size,
      ...(file.type ? { contentType: file.type } : {}),
      ...(replaceFileId === undefined ? {} : { replaceFileId }),
    };
    const created = await request<CreateBusinessFileResponse>(
      basePath,
      'create',
      {
        method: 'POST',
        body: JSON.stringify(createBody),
      },
    );
    assertCreateResponse(created);

    try {
      return toAdapterItem(
        await executeFileUploadPlan(created.plan, file, uploadOptions),
        'complete',
      );
    } catch (error) {
      throw toFileClientError(
        error,
        readFailureOperation(error),
        'File upload failed.',
      );
    }
  };

  return {
    async list(): Promise<FileAdapterItem[]> {
      const response = await request<StoredFile[]>(basePath, 'list');
      if (!Array.isArray(response)) {
        throw invalidBusinessResponse('list');
      }
      return response.map((file) => toAdapterItem(file, 'list'));
    },

    upload(
      file: File,
      uploadOptions: FileAdapterUploadOptions = {},
    ): Promise<FileAdapterItem> {
      return upload(file, uploadOptions);
    },

    retry(
      file: File,
      uploadOptions: FileAdapterUploadOptions = {},
    ): Promise<FileAdapterItem> {
      return upload(file, uploadOptions);
    },

    replace(
      fileId: string,
      file: File,
      uploadOptions: FileAdapterUploadOptions = {},
    ): Promise<FileAdapterItem> {
      return upload(file, uploadOptions, readFileId(fileId));
    },

    async access(
      fileId: string,
      disposition?: FileDisposition,
    ): Promise<string> {
      const path = `${itemPath(fileId)}/content`;
      return disposition === undefined
        ? path
        : `${path}?disposition=${encodeURIComponent(disposition)}`;
    },

    async detach(fileId: string): Promise<void> {
      await request<FileOperationResponse>(itemPath(fileId), 'detach', {
        method: 'DELETE',
      });
    },

    async enablePublicAccess(
      fileId: string,
      disposition?: FileDisposition,
    ): Promise<FilePublicAccessResult> {
      return publicAccess('public-access', fileId, disposition);
    },

    async resetPublicAccess(
      fileId: string,
      disposition?: FileDisposition,
    ): Promise<FilePublicAccessResult> {
      return publicAccess('public-access/reset', fileId, disposition);
    },

    async disablePublicAccess(fileId: string): Promise<FileAdapterItem> {
      return toAdapterItem(
        (
          await request<FileResponse>(
            `${itemPath(fileId)}/public-access`,
            'public-access',
            { method: 'DELETE' },
          )
        ).file,
        'public-access',
      );
    },
  };

  async function publicAccess(
    suffix: 'public-access' | 'public-access/reset',
    fileId: string,
    disposition?: FileDisposition,
  ): Promise<FilePublicAccessResult> {
    const body: PublicFileAccessRequest = {
      ...(disposition === undefined ? {} : { disposition }),
    };
    const response = await request<PublicFileAccessResponse>(
      `${itemPath(fileId)}/${suffix}`,
      'public-access',
      { method: 'POST', body: JSON.stringify(body) },
    );
    if (!isPublicAccess(response.access)) {
      throw invalidBusinessResponse('public-access');
    }
    return {
      item: toAdapterItem(response.file, 'public-access'),
      access: response.access,
    };
  }
}

function normalizeBasePath(value: string): string {
  const trimmed = value.trim();
  if (
    !trimmed ||
    /^[a-z][a-z\d+.-]*:/i.test(trimmed) ||
    trimmed.startsWith('//')
  ) {
    throw new FileClientError('The file adapter basePath is invalid.', {
      code: 'FILE_ADAPTER_INVALID',
      status: 0,
      operation: 'list',
    });
  }
  const normalized = trimmed.replace(/^\/+|\/+$/g, '');
  if (!normalized || normalized.includes('?') || normalized.includes('#')) {
    throw new FileClientError('The file adapter basePath is invalid.', {
      code: 'FILE_ADAPTER_INVALID',
      status: 0,
      operation: 'list',
    });
  }
  return normalized;
}

function readFileId(value: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new FileClientError('The fileId is invalid.', {
      code: 'FILE_ADAPTER_INVALID',
      status: 0,
      operation: 'content',
    });
  }
  return normalized;
}

function assertCreateResponse(
  response: CreateBusinessFileResponse,
): asserts response is CreateBusinessFileResponse {
  if (
    !isRecord(response) ||
    !isStoredFile(response.file) ||
    response.file.status !== 'pending' ||
    !isRecord(response.plan) ||
    response.plan.fileId !== response.file.id
  ) {
    throw invalidBusinessResponse('create');
  }
}

function toAdapterItem(
  file: StoredFile,
  operation: FileClientOperation,
): FileAdapterItem {
  if (!isStoredFile(file) || file.status !== 'ready') {
    throw invalidBusinessResponse(operation);
  }
  return file;
}

function isPublicAccess(
  value: unknown,
): value is PublicFileAccessResponse['access'] {
  return (
    isRecord(value) &&
    typeof value.url === 'string' &&
    typeof value.token === 'string' &&
    (value.disposition === 'inline' || value.disposition === 'attachment')
  );
}

function invalidBusinessResponse(
  operation: FileClientOperation,
): FileClientError {
  return new FileClientError('The file API returned an invalid response.', {
    code: 'FILE_RESPONSE_INVALID',
    status: 0,
    operation,
  });
}

function readFailureOperation(error: unknown): FileClientOperation {
  return error instanceof FileClientError ? error.operation : 'upload';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isStoredFile(value: unknown): value is StoredFile {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    (value.status === 'pending' ||
      value.status === 'ready' ||
      value.status === 'failed') &&
    typeof value.name === 'string' &&
    (value.size === null || typeof value.size === 'number') &&
    (value.contentType === null || typeof value.contentType === 'string') &&
    typeof value.createdAt === 'string' &&
    typeof value.updatedAt === 'string'
  );
}
