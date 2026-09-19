import { AuthorizationDeniedError } from '@nocobase/authorization/core';
import { RepositoryError } from '@nocobase/db';
import { CustomerInputError } from './input.js';

export interface CustomerFailure {
  readonly status: 400 | 403 | 404 | 409 | 500;
  readonly code: string;
}
export function customerFailure(error: unknown): CustomerFailure {
  if (error instanceof CustomerInputError || error instanceof SyntaxError)
    return { status: 400, code: 'INVALID_CUSTOMER_INPUT' };
  if (error instanceof AuthorizationDeniedError)
    return { status: 403, code: 'CUSTOMER_ACCESS_DENIED' };
  if (error instanceof RepositoryError) {
    if (error.code === 'VERSION_CONFLICT')
      return { status: 409, code: 'VERSION_CONFLICT' };
    if (error.code === 'RECORD_NOT_FOUND')
      return { status: 404, code: 'CUSTOMER_NOT_FOUND' };
  }
  return { status: 500, code: 'CUSTOMER_OPERATION_FAILED' };
}
