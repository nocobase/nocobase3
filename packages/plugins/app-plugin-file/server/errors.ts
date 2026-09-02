export interface FileErrorOptions extends ErrorOptions {
  readonly i18nKey?: string;
  readonly i18nParams?: Readonly<Record<string, unknown>>;
}

export class FileUnavailableError extends Error {
  readonly code = 'FILE_UNAVAILABLE' as const;
  readonly i18nKey: string;
  readonly i18nParams?: Readonly<Record<string, unknown>>;

  constructor(
    message: string = 'File service is unavailable.',
    options?: FileErrorOptions,
  ) {
    super(message, options);
    this.name = new.target.name;
    this.i18nKey = options?.i18nKey ?? 'errors.serviceUnavailable';
    this.i18nParams = options?.i18nParams;
  }
}

export class FileObjectNotFoundError extends Error {
  readonly code = 'FILE_OBJECT_NOT_FOUND' as const;
  readonly i18nKey = 'errors.storageObjectNotFound' as const;

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
  readonly i18nKey = 'errors.tokenInvalid' as const;

  constructor(message: string = 'The file access token is invalid.') {
    super(message);
    this.name = new.target.name;
  }
}

export class ExpiredFileTokenError extends Error {
  readonly code = 'FILE_TOKEN_EXPIRED' as const;
  readonly i18nKey = 'errors.tokenExpired' as const;

  constructor(message: string = 'The file access token has expired.') {
    super(message);
    this.name = new.target.name;
  }
}

export class InvalidFileInputError extends Error {
  readonly code = 'FILE_INPUT_INVALID' as const;
  readonly i18nKey: string;
  readonly i18nParams?: Readonly<Record<string, unknown>>;

  constructor(message: string, options?: FileErrorOptions) {
    super(message, options);
    this.name = new.target.name;
    this.i18nKey = options?.i18nKey ?? 'errors.inputInvalid';
    this.i18nParams = options?.i18nParams;
  }
}

export class FileLimitReachedError extends Error {
  readonly code = 'FILE_LIMIT_REACHED' as const;
  readonly i18nKey = 'errors.fileLimitReached' as const;

  constructor(
    message: string = 'The configured file count limit has been reached.',
  ) {
    super(message);
    this.name = new.target.name;
  }
}
