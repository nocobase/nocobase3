export class FilesUnavailableError extends Error {
  readonly code = 'FILES_UNAVAILABLE' as const;

  constructor(
    message = 'Files service is unavailable.',
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class FileObjectNotFoundError extends Error {
  readonly code = 'FILE_OBJECT_NOT_FOUND' as const;

  constructor(
    message = 'The stored file object was not found.',
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class InvalidFileTokenError extends Error {
  readonly code = 'FILE_TOKEN_INVALID' as const;

  constructor(message = 'The file access token is invalid.') {
    super(message);
    this.name = new.target.name;
  }
}

export class ExpiredFileTokenError extends Error {
  readonly code = 'FILE_TOKEN_EXPIRED' as const;

  constructor(message = 'The file access token has expired.') {
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
