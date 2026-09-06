import type { FieldDefinition } from '../collection/types.js';
import { RepositoryError, type RepositoryErrorCode } from './errors.js';

/** Internal synchronous conversion; public input validation stays separate. */
export interface BooleanStorageCodec {
  encode(value: boolean | null): boolean | number | null;
  decode(field: FieldDefinition, value: unknown): boolean | null;
}

const nativeBooleanCodec: BooleanStorageCodec = Object.freeze({
  encode: (value: boolean | null): boolean | null => value,
  decode: decodeBooleanValue,
});

const numericBooleanCodec: BooleanStorageCodec = Object.freeze({
  encode: (value: boolean | null): number | null =>
    value === null ? null : value ? 1 : 0,
  decode: decodeBooleanValue,
});

const booleanCodecs: ReadonlyMap<string, BooleanStorageCodec> = new Map([
  ['pg', nativeBooleanCodec],
  ['postgres', nativeBooleanCodec],
  ['postgresql', nativeBooleanCodec],
  ['mssql', nativeBooleanCodec],
]);

/** Resolve from the current storage definition, without a schema-sensitive cache. */
export function resolveBooleanStorageCodec(
  engine: string,
  field: FieldDefinition,
): BooleanStorageCodec {
  if (engine === 'oracledb' && /^boolean$/i.test(String(field.db?.nativeType)))
    return nativeBooleanCodec;
  return booleanCodecs.get(engine) ?? numericBooleanCodec;
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
  return resolveBooleanStorageCodec(engine, field).encode(normalized);
}
