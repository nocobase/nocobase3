export type FilesErrorCode =
  | 'FILE_NOT_FOUND'
  | 'FILE_NOT_READY'
  | 'UPLOAD_EXPIRED'
  | 'UPLOAD_SIZE_EXCEEDED'
  | 'UPLOAD_TYPE_NOT_ALLOWED'
  | 'UPLOAD_FAILED'
  | 'INVALID_ACCESS'
  | 'PUBLIC_ACCESS_DISABLED'
  | 'STORAGE_UNAVAILABLE';

export type FilesErrorStatus = 403 | 404 | 409 | 410 | 413 | 415 | 503;

export class FilesDataPlaneError extends Error {
  constructor(
    readonly code: FilesErrorCode,
    readonly status: FilesErrorStatus,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = new.target.name;
  }
}

export function fileNotFound(): FilesDataPlaneError {
  return new FilesDataPlaneError(
    'FILE_NOT_FOUND',
    404,
    'The requested file was not found.',
  );
}

export function fileNotReady(): FilesDataPlaneError {
  return new FilesDataPlaneError(
    'FILE_NOT_READY',
    409,
    'The requested file is not ready.',
  );
}

export function invalidAccess(): FilesDataPlaneError {
  return new FilesDataPlaneError(
    'INVALID_ACCESS',
    403,
    'The file access credential is invalid.',
  );
}

export function uploadExpired(): FilesDataPlaneError {
  return new FilesDataPlaneError(
    'UPLOAD_EXPIRED',
    410,
    'The file upload plan has expired.',
  );
}

export function storageUnavailable(cause?: unknown): FilesDataPlaneError {
  return new FilesDataPlaneError(
    'STORAGE_UNAVAILABLE',
    503,
    'File storage is temporarily unavailable.',
    cause === undefined ? undefined : { cause },
  );
}
