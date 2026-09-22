import { decimalString } from '../../numeric/decimal.js';
import { decodeJsonValue, type JsonResultForm } from '../../json.js';
import type {
  CollectionDefinition,
  FieldDefinition,
} from '../../collection/types.js';
import { decodeIntegerValue } from '../integer.js';
import { decodeBooleanValue } from '../boolean.js';
import { normalizeCharValue } from '../char.js';
import { normalizeEnumValue } from '../enum.js';
import { normalizeTemporalResultValue } from '../temporal.js';
import type { RepositoryRecord } from '../types.js';

type ScalarDecoder = (
  field: FieldDefinition,
  value: unknown,
) => RepositoryRecord[string];

export type RowDecoder = (row: RepositoryRecord) => RepositoryRecord;

/**
 * Decode with the result normalizer, not the mutation validator.
 *
 * These are stored values, and the shapes storage produces are not the shapes a caller writes: a timestamp whose
 * offset does not match the Field's logical type after a type change, more fractional digits than V1 keeps, a
 * space instead of the `T`, or the epoch milliseconds knex left in SQLite columns before temporal Fields were
 * normalized. Query has always decoded through `normalizeTemporalResultValue` for exactly that reason; Repository
 * validated instead, so the same row read through the two APIs could differ or fail on one of them.
 */
const decodeTemporal: ScalarDecoder = (field, value) =>
  normalizeTemporalResultValue(field, value);

/** Normalize logical scalar values, including driver-specific JSON payloads. */
const scalarDecoders: ReadonlyMap<string, ScalarDecoder> = new Map([
  ['boolean', decodeBooleanValue],
  ['integer', decodeIntegerValue],
  ['increments', decodeIntegerValue],
  ['bigInt', decodeIntegerValue],
  ['decimal', (_field, value) => decimalString(value)],
  ['float', (_field, value) => (value === null ? null : Number(value))],
  ['double', (_field, value) => (value === null ? null : Number(value))],
  [
    'enum',
    (field, value) =>
      normalizeEnumValue(field, value, 'INVALID_STORED_VALUE', [
        'select',
        field.name,
      ]),
  ],
  [
    'char',
    (field, value) =>
      normalizeCharValue(field, value, 'INVALID_STORED_VALUE', [
        'select',
        field.name,
      ]),
  ],
  ['date', decodeTemporal],
  ['time', decodeTemporal],
  ['datetime', decodeTemporal],
  ['datetimeTz', decodeTemporal],
]);

/** Prepare once per result shape; reuse synchronously for ordinary and streamed rows. */
export function prepareScalarRowDecoder(
  collection: CollectionDefinition,
  selectedFields?: readonly string[],
  trimCharResults = false,
  jsonResults: JsonResultForm = 'text',
): RowDecoder {
  const selected = selectedFields && new Set(selectedFields);
  const entries: {
    name: string;
    decode: (value: unknown) => RepositoryRecord[string];
  }[] = [];
  for (const field of collection.fields ?? []) {
    if ('target' in field) continue;
    if (selected && !selected.has(field.name)) continue;
    const decode =
      field.type === 'char' && trimCharResults
        ? (_: FieldDefinition, value: unknown) =>
            value === null ? null : (value as string).replace(/\s+$/u, '')
        : field.type === 'json'
          ? (target: FieldDefinition, value: unknown) =>
              decodeJsonValue(value, jsonResults, target)
          : scalarDecoders.get(field.type);
    if (decode) {
      entries.push({
        name: field.name,
        decode: (value) => decode(field, value),
      });
    }
  }
  return (row) => {
    const result = { ...row };
    for (const { name, decode } of entries) {
      if (Object.hasOwn(row, name)) result[name] = decode(row[name]);
    }
    return result;
  };
}
