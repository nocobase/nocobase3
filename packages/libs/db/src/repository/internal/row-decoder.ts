import { decimalString } from '../../numeric/decimal.js';
import { decodeJsonValue } from '../../json.js';
import type {
  CollectionDefinition,
  FieldDefinition,
} from '../../collection/types.js';
import { decodeIntegerValue } from '../integer.js';
import { decodeBooleanValue } from '../boolean.js';
import { normalizeCharValue } from '../char.js';
import { normalizeEnumValue } from '../enum.js';
import { normalizeTemporalValue } from '../temporal.js';
import type { RepositoryRecord } from '../types.js';

type ScalarDecoder = (
  field: FieldDefinition,
  value: unknown,
) => RepositoryRecord[string];

export type RowDecoder = (row: RepositoryRecord) => RepositoryRecord;

const decodeTemporal: ScalarDecoder = (field, value) =>
  normalizeTemporalValue(field, value, 'FIELD_CAPABILITY_NOT_SUPPORTED', [
    'select',
    field.name,
  ]);

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
  ['json', (_field, value) => decodeJsonValue(value)],
]);

/** Prepare once per result shape; reuse synchronously for ordinary and streamed rows. */
export function prepareScalarRowDecoder(
  collection: CollectionDefinition,
  selectedFields?: readonly string[],
  trimCharResults = false,
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
