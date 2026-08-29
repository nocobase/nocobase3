export type AppServiceErrorStatus = 400 | 409 | 503;

export class AppServiceError extends Error {
  constructor(
    message: string,
    readonly status: AppServiceErrorStatus,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class BadRequestError extends AppServiceError {
  constructor(message: string) {
    super(message, 400);
  }
}

export class ConflictError extends AppServiceError {
  constructor(message: string) {
    super(message, 409);
  }
}

export class ServiceUnavailableError extends AppServiceError {
  constructor(message: string) {
    super(message, 503);
  }
}
