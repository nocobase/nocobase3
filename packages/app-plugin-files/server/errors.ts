export class FilesUnavailableError extends Error {
  readonly code = 'FILES_UNAVAILABLE' as const;

  constructor(
    message: string = 'Files service is unavailable.',
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class FileObjectNotFoundError extends Error {
  readonly code = 'FILE_OBJECT_NOT_FOUND' as const;

  constructor(
    message: string = 'The stored file object was not found.',
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class InvalidFileTokenError extends Error {
  readonly code = 'FILE_TOKEN_INVALID' as const;

  constructor(message: string = 'The file access token is invalid.') {
    super(message);
    this.name = new.target.name;
  }
}

export class ExpiredFileTokenError extends Error {
  readonly code = 'FILE_TOKEN_EXPIRED' as const;

  constructor(message: string = 'The file access token has expired.') {
    super(message);
    this.name = new.target.name;
  }
}

export class InvalidFileInputError extends Error {
  readonly code = 'FILE_INPUT_INVALID' as const;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class FileLimitReachedError extends Error {
  readonly code = 'FILE_LIMIT_REACHED' as const;

  constructor(
    message: string = 'The configured file count limit has been reached.',
  ) {
    super(message);
    this.name = new.target.name;
  }
}
