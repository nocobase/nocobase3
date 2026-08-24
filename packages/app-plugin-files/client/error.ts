import type { FileClientErrorOptions, FileClientOperation } from './types.js';

export class FileClientError extends Error {
  readonly code: string;
  readonly status: number;
  readonly operation: FileClientOperation;

  constructor(message: string, options: FileClientErrorOptions) {
    super(
      message,
      options.cause === undefined ? undefined : { cause: options.cause },
    );
    this.name = 'FileClientError';
    this.code = options.code;
    this.status = options.status;
    this.operation = options.operation;
  }
}

export function toFileClientError(
  error: unknown,
  operation: FileClientOperation,
  fallback: string,
): FileClientError {
  if (error instanceof FileClientError) {
    return error;
  }
  const details = readErrorDetails(error);
  return new FileClientError(details.message ?? fallback, {
    code: details.code ?? 'FILE_REQUEST_FAILED',
    status: details.status ?? 0,
    operation,
    cause: error,
  });
}

export function createTransportError(
  operation: 'upload' | 'complete' | 'cancel',
  status: number,
  responseText: string,
  stableResponse: boolean,
): FileClientError {
  const response = stableResponse
    ? readStableErrorResponse(responseText)
    : undefined;
  return new FileClientError(
    response?.message ??
      (status > 0
        ? `File ${operation} failed with status ${status}.`
        : `File ${operation} transport failed.`),
    {
      code: response?.code ?? 'UPLOAD_FAILED',
      status,
      operation,
    },
  );
}

interface ErrorDetails {
  code?: string;
  message?: string;
  status?: number;
}

function readErrorDetails(error: unknown): ErrorDetails {
  if (!isRecord(error)) {
    return error instanceof Error ? { message: error.message } : {};
  }
  const payload = isRecord(error.payload) ? error.payload : error;
  return {
    ...(typeof payload.code === 'string' ? { code: payload.code } : {}),
    ...(typeof payload.error === 'string'
      ? { message: payload.error }
      : typeof error.message === 'string'
        ? { message: error.message }
        : {}),
    ...(typeof error.status === 'number' ? { status: error.status } : {}),
  };
}

function readStableErrorResponse(value: string):
  | {
      code: string;
      message: string;
    }
  | undefined {
  if (!value) {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(value);
    if (
      isRecord(parsed) &&
      typeof parsed.code === 'string' &&
      typeof parsed.error === 'string'
    ) {
      return { code: parsed.code, message: parsed.error };
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
