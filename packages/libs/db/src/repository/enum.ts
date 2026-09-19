import type { FieldDefinition } from '../collection/types.js';
import { RepositoryError, type RepositoryErrorCode } from './errors.js';

export function normalizeEnumValue(
  field: FieldDefinition,
  value: unknown,
  code: RepositoryErrorCode = 'INVALID_MUTATION',
  path: readonly (string | number)[] = ['values', field.name],
): string | null {
  if (
    value === null &&
    (code === 'INVALID_FILTER' ||
      (field.nullable !== false && !field.primaryKey))
  )
    return null;
  if (typeof value === 'string' && field.values?.includes(value)) return value;
  throw new RepositoryError(
    code,
    `Field "${field.name}" requires an allowed enum member${field.nullable !== false ? ' or null' : ''}.`,
    { field: field.name, path },
  );
}
