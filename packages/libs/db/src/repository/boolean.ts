import type { FieldDefinition } from '../collection/types.js';
import { RepositoryError, type RepositoryErrorCode } from './errors.js';

export interface BooleanStorageCodec {
  encode(value: boolean | null): boolean | number | null;
  decode(field: FieldDefinition, value: unknown): boolean | null;
}

export const nativeBooleanCodec: BooleanStorageCodec = Object.freeze({
  encode: (value: boolean | null): boolean | null => value,
  decode: decodeBooleanValue,
});

export const numericBooleanCodec: BooleanStorageCodec = Object.freeze({
  encode: (value: boolean | null): number | null =>
    value === null ? null : value ? 1 : 0,
  decode: decodeBooleanValue,
});

export function resolveBooleanStorageCodec(
  kind: 'native' | 'numeric',
  _field: FieldDefinition,
): BooleanStorageCodec {
  return kind === 'native' ? nativeBooleanCodec : numericBooleanCodec;
}

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
  kind: 'native' | 'numeric',
  field: FieldDefinition,
  value: unknown,
): boolean | number | null {
  const normalized = normalizeBooleanValue(field, value);
  return resolveBooleanStorageCodec(kind, field).encode(normalized);
}
