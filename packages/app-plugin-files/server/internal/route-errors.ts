export type FileRouteErrorCode =
  | 'FILE_ROUTE_INVALID'
  | 'FILE_NOT_FOUND'
  | 'FILE_NOT_READY'
  | 'FILE_BINDING_CONFLICT'
  | 'FILE_LIMIT_EXCEEDED'
  | 'UPLOAD_EXPIRED'
  | 'UPLOAD_FAILED'
  | 'INVALID_ACCESS';

export type FileRouteErrorStatus = 400 | 403 | 404 | 409 | 410 | 500;

export class FileRouteError extends Error {
  constructor(
    readonly code: FileRouteErrorCode,
    readonly status: FileRouteErrorStatus,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = new.target.name;
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
