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
    if (field.type !== 'datetimeTz' || !Number.isFinite(value.getTime()))
      return fail();
    value = value.toISOString();
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
