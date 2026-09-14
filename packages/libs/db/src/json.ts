import type { JsonValue } from '@nocobase/repository-input';
import type { FieldDefinition } from './collection/types.js';
import { RepositoryError } from './repository/errors.js';

export type { JsonValue };

/**
 * How a driver hands back a `json` column. Declared by the dialect through
 * `jsonResults`, because the returned value carries no evidence of which it is.
 */
export type JsonResultForm = 'parsed' | 'text';

/**
 * JSON columns use the same structured value contract at the public API
 * boundary: a caller passes a JSON value and reads one back, and every
 * non-null value is stored as valid JSON text.
 *
 * `null` encodes to SQL NULL rather than to the JSON literal `null`. The
 * write side has no way to express the difference, so `$jsonNull` and
 * `$jsonAnyNull` only ever match rows written outside this API.
 */
export function encodeJsonValue(value: JsonValue): string | null {
  return value === null ? null : JSON.stringify(value);
}

/**
 * Decoding never guesses. A `parsed` driver has already produced the value;
 * a `text` driver hands back the stored JSON, which must parse or the row is
 * reported as corrupt rather than silently read back as a string.
 */
export function decodeJsonValue(
  value: unknown,
  form: JsonResultForm = 'text',
  field?: FieldDefinition,
): JsonValue {
  if (value === null || value === undefined) return null;
  if (form === 'parsed') return value as JsonValue;
  // A numeric-affinity column hands back the number it stored rather than the
  // JSON text; both decode to the same value.
  if (typeof value !== 'string') return value as JsonValue;
  try {
    return JSON.parse(value) as JsonValue;
  } catch {
    throw new RepositoryError(
      'INVALID_STORED_VALUE',
      `Field "${field?.name ?? 'json'}" holds text that is not valid JSON.`,
      field ? { field: field.name, path: ['select', field.name] } : {},
    );
  }
}
