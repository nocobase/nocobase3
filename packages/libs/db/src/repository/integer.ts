import type { FieldDefinition } from '../collection/types.js';
import { RepositoryError } from './errors.js';

/** Normalize only after the driver has preserved the exact stored integer. */
export function decodeIntegerValue(
  field: FieldDefinition,
  value: unknown,
): string | number | null {
  if (value === null) return null;
  if (
    (typeof value === 'string' && /^[+-]?\d+$/.test(value)) ||
    typeof value === 'bigint' ||
    (typeof value === 'number' && Number.isSafeInteger(value))
  ) {
    if (field.type === 'bigInt') return BigInt(value).toString();
    const number = Number(value);
    if (Number.isSafeInteger(number)) return number;
  }
  throw new RepositoryError(
    'INVALID_STORED_VALUE',
    `Field "${field.name}" must contain an exact integer.`,
    { field: field.name, path: ['select', field.name] },
  );
}
