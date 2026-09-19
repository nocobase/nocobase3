import type { FieldDefinition } from '../collection/types.js';
import { RepositoryError, type RepositoryErrorCode } from './errors.js';

export type TemporalType = 'date' | 'time' | 'datetime' | 'datetimeTz';

export function isTemporalType(type: string): type is TemporalType {
  return ['date', 'time', 'datetime', 'datetimeTz'].includes(type);
}

/** Validate before parsing; Date.parse alone silently normalizes invalid dates. */
export function normalizeTemporalValue(
  field: FieldDefinition,
  input: unknown,
  code: RepositoryErrorCode = 'INVALID_MUTATION',
  path: readonly (string | number)[] = ['values', field.name],
): string | null {
  const fail = (): never => {
    throw new RepositoryError(
      code,
      `Invalid ${field.type} value for Field "${field.name}". Expected a valid V1 temporal value with at most millisecond precision.`,
      { field: field.name, path },
    );
  };
  if (input === null) {
    if (field.nullable === false || field.primaryKey) return fail();
    return null;
  }
  let value = input;
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) return fail();
    const pad = (part: number) => String(part).padStart(2, '0');
    const milliseconds = String(value.getMilliseconds()).padStart(3, '0');
    value =
      field.type === 'date'
        ? `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`
        : field.type === 'time'
          ? `${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}.${milliseconds}`
          : field.type === 'datetime'
            ? `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}.${milliseconds}`
            : value.toISOString();
  }
  if (typeof value !== 'string') return fail();
  const datePattern = '(\\d{4})-(\\d{2})-(\\d{2})';
  const timePattern = '(\\d{2}):(\\d{2}):(\\d{2})(?:\\.(\\d{1,3}))?';
  if (field.type === 'time') {
    const time = value.match(new RegExp(`^${timePattern}$`));
    if (
      !time ||
      Number(time[1]) > 23 ||
      Number(time[2]) > 59 ||
      Number(time[3]) > 59
    )
      return fail();
    return `${time[1]}:${time[2]}:${time[3]}.${(time[4] ?? '').padEnd(3, '0')}`;
  }
  const pattern =
    field.type === 'date'
      ? `^${datePattern}$`
      : `^${datePattern}T${timePattern}${field.type === 'datetimeTz' ? '(Z|[+-]\\d{2}:\\d{2})' : ''}$`;
  const match = value.match(new RegExp(pattern));
  if (!match) return fail();
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const calendar = new Date(Date.UTC(year, month - 1, day));
  if (
    year < 1000 ||
    year > 9999 ||
    calendar.getUTCFullYear() !== year ||
    calendar.getUTCMonth() !== month - 1 ||
    calendar.getUTCDate() !== day
  )
    return fail();
  if (field.type === 'date') return value;
  if (Number(match[4]) > 23 || Number(match[5]) > 59 || Number(match[6]) > 59)
    return fail();
  const local = `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}.${(match[7] ?? '').padEnd(3, '0')}`;
  if (field.type === 'datetime') return local;
  const offset = match[8];
  if (
    offset !== 'Z' &&
    (Number(offset.slice(1, 3)) > 14 ||
      Number(offset.slice(4)) > 59 ||
      (Number(offset.slice(1, 3)) === 14 && Number(offset.slice(4)) !== 0) ||
      offset === '-00:00')
  )
    return fail();
  const instant = new Date(`${local}${offset}`);
  if (
    !Number.isFinite(instant.getTime()) ||
    instant.getUTCFullYear() < 1000 ||
    instant.getUTCFullYear() > 9999
  )
    return fail();
  return instant.toISOString();
}

/**
 * Recognize epoch milliseconds left behind by the query builder before it knew about temporal Fields.
 *
 * It used to hand `Date` values straight to the driver, and knex stores a `Date` on SQLite as `getTime()`, so a
 * `datetime` column written through `database.query()` at the time holds `1789908736452` as a REAL, or the text
 * `"1789908736452.0"` once the column's TEXT affinity has had its way. Without this, the first read of such a row
 * fails with `FIELD_CAPABILITY_NOT_SUPPORTED` and an application that upgraded in place cannot even sign a user in.
 *
 * No valid V1 temporal string is a bare number, so the shape is unambiguous. Only values with at least twelve digits
 * qualify, which keeps a short numeric string on the ordinary validation path so it is still reported as invalid.
 * The value is read back as the instant it was and rendered exactly as a `Date` result would be.
 */
function legacyEpochMilliseconds(input: unknown): number | undefined {
  if (typeof input === 'number') {
    return Number.isFinite(input) && Math.abs(input) >= 1e11
      ? input
      : undefined;
  }
  if (typeof input !== 'string') return undefined;
  const match = input.match(/^(-?\d{12,16})(?:\.0+)?$/);
  return match ? Number(match[1]) : undefined;
}

/** Normalize driver-native temporal results to the portable string contract. */
export function normalizeTemporalResultValue(
  field: FieldDefinition,
  raw: unknown,
): string | null {
  if (raw === null) return null;
  const legacy = legacyEpochMilliseconds(raw);
  const input = legacy === undefined ? raw : new Date(legacy);
  if (input instanceof Date) {
    if (!Number.isFinite(input.getTime())) {
      throw new RepositoryError(
        'FIELD_CAPABILITY_NOT_SUPPORTED',
        `Invalid stored ${field.type} value for Field "${field.name}".`,
        { field: field.name, path: ['select', field.name] },
      );
    }
    const pad = (value: number) => String(value).padStart(2, '0');
    const milliseconds = String(input.getMilliseconds()).padStart(3, '0');
    if (field.type === 'date')
      return `${input.getFullYear()}-${pad(input.getMonth() + 1)}-${pad(input.getDate())}`;
    if (field.type === 'time')
      return `${pad(input.getHours())}:${pad(input.getMinutes())}:${pad(input.getSeconds())}.${milliseconds}`;
    if (field.type === 'datetime')
      return `${input.getFullYear()}-${pad(input.getMonth() + 1)}-${pad(input.getDate())}T${pad(input.getHours())}:${pad(input.getMinutes())}:${pad(input.getSeconds())}.${milliseconds}`;
    return input.toISOString();
  }
  if (typeof input !== 'string') {
    throw new RepositoryError(
      'FIELD_CAPABILITY_NOT_SUPPORTED',
      `Invalid stored ${field.type} value for Field "${field.name}".`,
      { field: field.name, path: ['select', field.name] },
    );
  }
  if (field.type === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(input))
    return normalizeTemporalValue(
      field,
      input,
      'FIELD_CAPABILITY_NOT_SUPPORTED',
    );
  if (field.type === 'time') {
    const normalized = input.replace(
      /^(\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?$/,
      (_match, clock: string, fraction?: string) =>
        `${clock}.${(fraction ?? '').slice(0, 3).padEnd(3, '0')}`,
    );
    return normalizeTemporalValue(
      field,
      normalized,
      'FIELD_CAPABILITY_NOT_SUPPORTED',
    );
  }
  const normalized = input.replace(' ', 'T');
  if (
    field.type === 'datetime' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?$/.test(normalized)
  ) {
    const [whole, fraction = ''] = normalized.split('.');
    return normalizeTemporalValue(
      field,
      `${whole}.${fraction.slice(0, 3).padEnd(3, '0')}`,
      'FIELD_CAPABILITY_NOT_SUPPORTED',
    );
  }
  if (
    field.type === 'datetimeTz' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(
      normalized,
    )
  ) {
    const match = normalized.match(
      /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/,
    );
    return normalizeTemporalValue(
      field,
      `${match![1]}.${(match![2] ?? '').slice(0, 3).padEnd(3, '0')}${match![3]}`,
      'FIELD_CAPABILITY_NOT_SUPPORTED',
    );
  }
  return normalizeTemporalValue(
    field,
    normalized,
    'FIELD_CAPABILITY_NOT_SUPPORTED',
  );
}
