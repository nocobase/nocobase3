import type { DatabaseExplorerErrorCode } from '../../server/types.js';

interface ErrorBody {
  readonly code?: string;
  readonly message?: string;
}

const MESSAGE_KEYS: Readonly<Record<DatabaseExplorerErrorCode, string>> = {
  DATABASE_UNAVAILABLE: 'errors.databaseUnavailable',
  DATABASE_EXPLORER_FORBIDDEN: 'errors.forbidden',
  CONNECTION_NOT_FOUND: 'errors.connectionNotFound',
  CONNECTION_UNAVAILABLE: 'errors.connectionUnavailable',
  CONNECTION_UNREACHABLE: 'errors.connectionUnreachable',
  SCHEMA_READ_DENIED: 'errors.schemaReadDenied',
  COLLECTION_NOT_FOUND: 'errors.collectionNotFound',
  INVALID_LIST_OPTIONS: 'errors.invalidListOptions',
  INVALID_CURSOR: 'errors.invalidCursor',
};

/**
 * Reads a failure into the viewer's language.
 *
 * The server answers with a stable `code` and a fixed English message, so the
 * wording lives here rather than in Server locale resources: an API error is
 * rendered by the browser that knows which language is on screen, and the code
 * is what stays constant for anything else reading the response.
 */
export function explorerErrorMessage(
  error: unknown,
  t: (key: string) => string,
): string {
  const key = MESSAGE_KEYS[errorCode(error) as DatabaseExplorerErrorCode];
  if (key) return t(key);
  return error instanceof Error && error.message
    ? error.message
    : t('errors.unknown');
}

/** Digs the plugin's `code` out of whatever the API client threw. */
export function errorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const candidate = error as {
    body?: ErrorBody;
    data?: ErrorBody;
    code?: unknown;
  };
  const body = candidate.body ?? candidate.data;
  if (body && typeof body.code === 'string') return body.code;
  return typeof candidate.code === 'string' ? candidate.code : undefined;
}
