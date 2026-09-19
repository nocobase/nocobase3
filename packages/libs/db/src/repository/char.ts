import type { FieldDefinition } from '../collection/types.js';
import { RepositoryError, type RepositoryErrorCode } from './errors.js';

/** Validate native-width CHAR values without padding, trimming, or coercion. */
export function normalizeCharValue(
  field: FieldDefinition,
  value: unknown,
  code: RepositoryErrorCode = 'INVALID_MUTATION',
  path: readonly (string | number)[] = ['values', field.name],
): string | null {
  if (value === null && field.nullable !== false && !field.primaryKey)
    return null;
  if (
    typeof value !== 'string' ||
    /[\uD800-\uDFFF]/u.test(value) ||
    value.includes('\0')
  )
    throw new RepositoryError(
      code,
      `Field "${field.name}" requires a well-formed string without NUL.`,
      { field: field.name, path },
    );
  // BYTE declarations remain subject to the database's encoding and byte ceiling.
  const size =
    field.db?.lengthUnit === 'utf16CodeUnits'
      ? value.length
      : [...value].length;
  if (field.length !== undefined && size > field.length)
    throw new RepositoryError(
      code,
      `Field "${field.name}" exceeds its CHAR length.`,
      { field: field.name, path },
    );
  return value;
}
