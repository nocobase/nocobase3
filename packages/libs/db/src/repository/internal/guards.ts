import type { RepositoryRecord } from '@nocobase/repository-input';
import { RepositoryError } from '../errors.js';

export function isPlainRecord(value: unknown): value is RepositoryRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

export function invalid(
  code: ConstructorParameters<typeof RepositoryError>[0],
  message: string,
  options: ConstructorParameters<typeof RepositoryError>[2] = {},
): never {
  throw new RepositoryError(code, message, options);
}
