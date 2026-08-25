export class ReleaseManagementError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(
    message: string,
    options: { status: number; code: string; cause?: unknown },
  ) {
    super(message, { cause: options.cause });
    this.name = new.target.name;
    this.status = options.status;
    this.code = options.code;
  }
}

export class AppHostRequestError extends ReleaseManagementError {
  constructor(
    message: string,
    options: { status?: number; code?: string; cause?: unknown } = {},
  ) {
    super(message, {
      status: options.status ?? 502,
      code: options.code ?? 'APP_HOST_UNAVAILABLE',
      cause: options.cause,
    });
  }
}
