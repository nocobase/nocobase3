import type { Context } from 'hono';

import type { NocoBaseLogger } from '@nocobase/logger';

import { AppServiceError } from '../services/errors.js';

export interface ApiErrorHandlerOptions {
  logger: NocoBaseLogger;
}

export function createApiErrorHandler(options: ApiErrorHandlerOptions) {
  return (error: Error, c: Context): Response => {
    if (error instanceof AppServiceError) {
      return c.json(
        {
          error: error.message,
        },
        error.status,
      );
    }

    options.logger.error({ err: error }, 'Unhandled API error');
    return c.json(
      {
        error: 'Internal server error.',
      },
      500,
    );
  };
}
