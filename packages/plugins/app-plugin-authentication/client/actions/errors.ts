import type { AuthenticationActionError } from './types.js';

export function resolveAuthenticationActionError(
  error: unknown,
): AuthenticationActionError | undefined {
  if (!error) return undefined;
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'object' &&
          error !== null &&
          'message' in error &&
          typeof error.message === 'string'
        ? error.message
        : 'Authentication request failed.';
  return message ? { message } : undefined;
}
