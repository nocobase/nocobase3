import type { FieldDefinition } from '../collection/types.js';
import { RepositoryError, type RepositoryErrorCode } from './errors.js';

export function normalizeBooleanValue(
  field: FieldDefinition,
  value: unknown,
  code: RepositoryErrorCode = 'INVALID_MUTATION',
  path: readonly (string | number)[] = ['values', field.name],
): boolean | null {
  if (typeof value === 'boolean') return value;
  if (value === null && field.nullable !== false && !field.primaryKey)
    return null;
  throw new RepositoryError(
    code,
    `Field "${field.name}" requires a boolean${field.nullable !== false ? ' or null' : ''}.`,
    { field: field.name, path },
  );
}

/** Driver decoding is deliberately separate from strict public input validation. */
export function decodeBooleanValue(
  field: FieldDefinition,
  value: unknown,
): boolean | null {
  if (value === 0 || value === '0') return false;
  if (value === 1 || value === '1') return true;
  return normalizeBooleanValue(field, value, 'INVALID_STORED_VALUE', [
    'select',
    field.name,
  ]);
}

export function booleanStorageValue(
  engine: string,
  field: FieldDefinition,
  value: unknown,
): boolean | number | null {
  const normalized = normalizeBooleanValue(field, value);
  if (normalized === null) return null;
  if (['pg', 'postgres', 'postgresql', 'mssql'].includes(engine))
    return normalized;
  if (engine === 'oracledb' && /^boolean$/i.test(String(field.db?.nativeType)))
    return normalized;
  return normalized ? 1 : 0;
}
