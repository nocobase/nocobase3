export type DomainErrorCode =
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'CONFLICT'
  | 'INFRASTRUCTURE_ERROR';

export class DomainError extends Error {
  public constructor(
    public readonly code: DomainErrorCode,
    message: string,
    public readonly status: number,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'DomainError';
  }
}

export function validationError(message: string): DomainError {
  return new DomainError('VALIDATION_ERROR', message, 400);
}

export function notFoundError(message: string): DomainError {
  return new DomainError('NOT_FOUND', message, 404);
}

export function forbiddenError(message: string): DomainError {
  return new DomainError('FORBIDDEN', message, 403);
}

export function infrastructureError(
  message: string,
  cause?: unknown,
): DomainError {
  return new DomainError('INFRASTRUCTURE_ERROR', message, 500, { cause });
}

export interface DomainStreamTarget {
  write(chunk: unknown): void;
  end(chunk?: unknown): void;
}

export function sendStreamError(
  target: DomainStreamTarget,
  error: Error | string,
  errorName?: string,
): void {
  const body =
    typeof error === 'string' ? error : error.message || 'Unknown error';
  target.write(
    `data: ${JSON.stringify({ type: 'error', body, errorName })}\n\n`,
  );
  target.end();
}

export class ResourceActionError extends DomainError {
  public constructor(status: number, message: string, options?: ErrorOptions) {
    super(
      status === 403
        ? 'FORBIDDEN'
        : status === 404
          ? 'NOT_FOUND'
          : status === 409
            ? 'CONFLICT'
            : status >= 500
              ? 'INFRASTRUCTURE_ERROR'
              : 'VALIDATION_ERROR',
      message,
      status,
      options,
    );
    this.name = 'ResourceActionError';
  }
}
