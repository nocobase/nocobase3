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
      isStableErrorCode(parsed.code) &&
      typeof parsed.error === 'string'
    ) {
      return {
        code: parsed.code,
        message: redactSensitiveDetails(parsed.error),
      };
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function isStableErrorCode(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Z][A-Z0-9_]*$/.test(value);
}

function redactSensitiveDetails(value: string): string {
  return value
    .replace(/\bhttps?:\/\/[^\s"'<>]+/giu, '[redacted-url]')
    .replace(
      /(\b(?:access|capability|credential|signature|token)=)[^&\s"'<>]*/giu,
      '$1[redacted]',
    )
    .replace(/\bBearer\s+[^\s"'<>]+/giu, 'Bearer [redacted]');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
