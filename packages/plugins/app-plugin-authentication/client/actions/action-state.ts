import type { AuthActionResponse } from '@refinedev/core';

import type { AuthenticationActionError } from './types.js';

interface ErrorLike {
  readonly message?: string;
}

export function resolveAuthenticationActionError(
  data: AuthActionResponse | undefined,
  error: ErrorLike | null,
): AuthenticationActionError | undefined {
  const message = data?.error?.message ?? error?.message;
  return message ? { message } : undefined;
}
