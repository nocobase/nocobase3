import type {
  CommitBusinessFileRequest,
  CreateBusinessFileRequest,
  CreateBusinessFileResponse,
  DeleteBusinessFileRequest,
  FileAccessRequest,
  FileAccessResponse,
  FileDisposition,
  FileOperationResponse,
  FileReference,
  ListFileReferencesResponse,
  PublicFileAccessRequest,
  PublicFileAccessResponse,
  TemporaryFileAccess,
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

  const removeAttempt = async (
    fileId: string,
    bindingCredential: string,
  ): Promise<void> => {
    const body: DeleteBusinessFileRequest = { bindingCredential };
    try {
      await options.client.request<FileOperationResponse>(itemPath(fileId), {
        method: 'DELETE',
        body: JSON.stringify(body),
      });
    } catch {
      // Cleanup failure must not replace the upload or commit error.
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
      await executeFileUploadPlan(created.uploadPlan, file, uploadOptions);
      const commitBody: CommitBusinessFileRequest = {
        bindingCredential: created.bindingCredential,
      };
      return toAdapterItem(
        await request<FileReference>(
          `${itemPath(created.file.id)}/commit`,
          'commit',
          {
            method: 'POST',
            body: JSON.stringify(commitBody),
            signal: uploadOptions.signal,
          },
        ),
        'commit',
      );
    } catch (error) {
      await removeAttempt(created.file.id, created.bindingCredential);
      throw toFileClientError(
        error,
        readFailureOperation(error),
        'File upload failed.',
      );
    }
  };

  return {
    async list(): Promise<FileAdapterItem[]> {
      const response = await request<ListFileReferencesResponse>(
        basePath,
        'list',
      );
      if (!Array.isArray(response.references)) {
        throw invalidBusinessResponse('list');
      }
      return response.references.map((reference) =>
        toAdapterItem(reference, 'list'),
      );
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
    ): Promise<TemporaryFileAccess> {
      const body: FileAccessRequest = {
        ...(disposition === undefined ? {} : { disposition }),
      };
      const response = await request<FileAccessResponse>(
        `${itemPath(fileId)}/access`,
        'access',
        { method: 'POST', body: JSON.stringify(body) },
      );
      if (!isTemporaryAccess(response.access)) {
        throw invalidBusinessResponse('access');
      }
      return response.access;
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
        await request<FileReference>(
          `${itemPath(fileId)}/public-access`,
          'public-access',
          { method: 'DELETE' },
        ),
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
      item: toAdapterItem(response.reference, 'public-access'),
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
      operation: 'access',
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
    !isRecord(response.uploadPlan) ||
    response.uploadPlan.fileId !== response.file.id ||
    typeof response.bindingCredential !== 'string' ||
    !response.bindingCredential
  ) {
    throw invalidBusinessResponse('create');
  }
}

function toAdapterItem(
  reference: FileReference,
  operation: FileClientOperation,
): FileAdapterItem {
  if (
    !isRecord(reference) ||
    !isStoredFile(reference.file) ||
    reference.file.status !== 'ready' ||
    (reference.slot !== undefined && typeof reference.slot !== 'number')
  ) {
    throw invalidBusinessResponse(operation);
  }
  return {
    ...reference.file,
    ...(reference.slot === undefined ? {} : { slot: reference.slot }),
  };
}

function isTemporaryAccess(value: unknown): value is TemporaryFileAccess {
  return (
    isRecord(value) &&
    typeof value.url === 'string' &&
    typeof value.expiresAt === 'string' &&
    (value.disposition === 'inline' || value.disposition === 'attachment')
  );
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

function isStoredFile(value: unknown): value is FileReference['file'] {
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
