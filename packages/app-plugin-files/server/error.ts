export type FileServiceErrorCode =
  | 'FILE_NOT_FOUND'
  | 'FILE_NOT_READY'
  | 'FILE_ROUTE_INVALID'
  | 'FILE_LIMIT_EXCEEDED'
  | 'FILE_BINDING_CONFLICT'
  | 'UPLOAD_EXPIRED'
  | 'UPLOAD_SIZE_EXCEEDED'
  | 'UPLOAD_TYPE_NOT_ALLOWED'
  | 'UPLOAD_FAILED'
  | 'INVALID_ACCESS'
  | 'PUBLIC_ACCESS_DISABLED'
  | 'STORAGE_UNAVAILABLE';

export type FileServiceErrorStatus =
  400 | 403 | 404 | 409 | 410 | 413 | 415 | 500 | 503;

export class FileServiceError extends Error {
  constructor(
    readonly code: FileServiceErrorCode,
    readonly status: FileServiceErrorStatus,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}
