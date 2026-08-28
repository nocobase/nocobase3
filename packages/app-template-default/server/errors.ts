export type AppErrorStatus = 400 | 503;

export class AppError extends Error {
  constructor(
    message: string,
    readonly status: AppErrorStatus,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class BadRequestError extends AppError {
  constructor(message: string) {
    super(message, 400);
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message: string) {
    super(message, 503);
  }
}
