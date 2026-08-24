import {
  FileServiceError,
  type FileServiceErrorCode,
  type FileServiceErrorStatus,
} from '../error.js';

export class FileRouteError extends FileServiceError {
  constructor(
    code: FileServiceErrorCode,
    status: FileServiceErrorStatus,
    message: string,
  ) {
    super(code, status, message);
  }
}

export function invalidFileRoute(message: string): FileRouteError {
  return new FileRouteError('FILE_ROUTE_INVALID', 500, message);
}

export function invalidFileRequest(message: string): FileRouteError {
  return new FileRouteError('UPLOAD_FAILED', 400, message);
}

export function fileBindingConflict(): FileRouteError {
  return new FileRouteError(
    'FILE_BINDING_CONFLICT',
    409,
    'The file binding no longer matches the business record.',
  );
}

export function fileLimitExceeded(): FileRouteError {
  return new FileRouteError(
    'FILE_LIMIT_EXCEEDED',
    409,
    'The business record has reached its file limit.',
  );
}

export function invalidScopedCapability(): FileRouteError {
  return new FileRouteError(
    'INVALID_ACCESS',
    403,
    'The scoped file capability is invalid.',
  );
}

export function expiredScopedCapability(): FileRouteError {
  return new FileRouteError(
    'UPLOAD_EXPIRED',
    410,
    'The scoped file capability has expired.',
  );
}

export function businessRecordNotFound(): FileRouteError {
  return new FileRouteError(
    'FILE_NOT_FOUND',
    404,
    'The business record was not found.',
  );
}

export function fileReferenceNotFound(): FileRouteError {
  return new FileRouteError(
    'FILE_NOT_FOUND',
    404,
    'The file reference was not found.',
  );
}

export function businessFileNotReady(): FileRouteError {
  return new FileRouteError(
    'FILE_NOT_READY',
    409,
    'The file is not ready to be bound.',
  );
}
