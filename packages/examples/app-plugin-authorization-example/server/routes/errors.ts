import type { ErrorHandler } from 'hono';
import type { AuthorizationEnv } from '@nocobase/app-plugin-authorization';
import { RepositoryError } from '@nocobase/db';
import { AuthorizationDeniedError } from '@nocobase/authorization/core';

import { StateConflictError } from './mutations.js';

export const handleRouteError: ErrorHandler<AuthorizationEnv> = (error, c) => {
  if (error instanceof StateConflictError)
    return c.json({ code: 'STATE_CONFLICT' }, 409);

  if (
    error instanceof RepositoryError &&
    [
      'INVALID_MUTATION',
      'INVALID_FILTER',
      'RELATION_NOT_FOUND',
      'FIELD_NOT_FOUND',
    ].includes(error.code)
  )
    return c.json({ code: 'INVALID_INPUT' }, 400);

  if (error instanceof TypeError) return c.json({ code: 'INVALID_INPUT' }, 400);

  if (
    error instanceof AuthorizationDeniedError ||
    (error instanceof RepositoryError &&
      [
        'READ_FORBIDDEN',
        'WRITE_FORBIDDEN',
        'FIELD_WRITE_FORBIDDEN',
        'RELATION_WRITE_FORBIDDEN',
        'RECORD_NOT_FOUND',
        'RELATION_TARGET_NOT_FOUND',
        'RECORD_OUTSIDE_SCOPE',
        'SCOPE_VIOLATION',
      ].includes(error.code))
  )
    return c.json({ code: 'FORBIDDEN' }, 403);

  throw error;
};
