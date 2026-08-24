import {
  FileServiceError,
  type FileServiceErrorCode,
  type FileServiceErrorStatus,
} from '../error.js';

export class FilesDataPlaneError extends FileServiceError {
  constructor(
    code: FileServiceErrorCode,
    status: FileServiceErrorStatus,
    message: string,
  ) {
    super(code, status, message);
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

export function storageUnavailable(): FilesDataPlaneError {
  return new FilesDataPlaneError(
    'STORAGE_UNAVAILABLE',
    503,
    'File storage is temporarily unavailable.',
  );
}
