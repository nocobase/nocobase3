import type { Knex } from 'knex';
import type { FieldDefinition } from '../../collection/types.js';
import { RepositoryError } from '../errors.js';
import { isTemporalType, normalizeTemporalValue } from '../temporal.js';

export interface TemporalSqlClient {
  readonly client: Knex.Client;
  raw: Knex['raw'];
}

function dialect(client: TemporalSqlClient): string {
  return String(client.client.config.client);
}

function assertPrecision(field: FieldDefinition): void {
  if ((field.fractionalSecondsPrecision ?? 3) > 3)
    throw new RepositoryError(
      'FIELD_CAPABILITY_NOT_SUPPORTED',
      `Field "${field.name}" exceeds V1 millisecond precision.`,
      { field: field.name },
    );
}

export function temporalBinding(
  client: TemporalSqlClient,
  field: FieldDefinition,
  value: unknown,
): Knex.Raw | string | null {
  assertPrecision(field);
  const normalized = normalizeTemporalValue(field, value);
  if (normalized === null) return null;
  const precision = field.fractionalSecondsPrecision ?? 3;
  const fraction = normalized.match(/\.(\d{3})/)?.[1];
  if (fraction && /[1-9]/.test(fraction.slice(precision)))
    throw new RepositoryError(
      'INVALID_MUTATION',
      `Value exceeds Field "${field.name}" fractional-second precision.`,
      { field: field.name },
    );
  const engine = dialect(client);
  const instant = field.type === 'datetimeTz';
  if (engine === 'oracledb') {
    if (field.type === 'date')
      return client.raw("to_date(?, 'YYYY-MM-DD')", [normalized]);
    if (field.type === 'time') return normalized;
    return instant
      ? client.raw(
          'to_timestamp_tz(?, \'YYYY-MM-DD"T"HH24:MI:SS.FF3TZH:TZM\')',
          [normalized.replace('Z', '+00:00')],
        )
      : client.raw('to_timestamp(?, \'YYYY-MM-DD"T"HH24:MI:SS.FF3\')', [
          normalized,
        ]);
  }
  if (engine === 'mysql2' || engine === 'mysql') {
    const physical = normalized.replace('T', ' ').replace(/Z$/, '');
    if (instant && /^timestamp(?:\(|$)/i.test(String(field.db?.nativeType))) {
      if (
        normalized < '1970-01-01T00:00:01.000Z' ||
        normalized > '2038-01-19T03:14:07.000Z'
      )
        throw new RepositoryError(
          'INVALID_MUTATION',
          'Value exceeds the native MySQL TIMESTAMP range.',
          { field: field.name },
        );
      return client.raw("convert_tz(?, '+00:00', @@session.time_zone)", [
        physical,
      ]);
    }
    return physical;
  }
  if (engine === 'mssql') {
    const native = String(field.db?.nativeType).toLowerCase();
    if (
      native === 'smalldatetime' &&
      (normalized < '1900-01-01T00:00:00.000' ||
        normalized > '2079-06-06T23:59:00.000' ||
        !normalized.endsWith(':00.000'))
    )
      throw new RepositoryError(
        'INVALID_MUTATION',
        'SMALLDATETIME requires a value in its native range with minute precision.',
        { field: field.name },
      );
    if (
      native === 'datetime' &&
      (normalized < '1753-01-01T00:00:00.000' ||
        normalized > '9999-12-31T23:59:59.997')
    )
      throw new RepositoryError(
        'INVALID_MUTATION',
        'Value exceeds the native SQL Server DATETIME range.',
        { field: field.name },
      );
    if (native === 'datetime' && !/[037]$/.test(normalized))
      throw new RepositoryError(
        'INVALID_MUTATION',
        'SQL Server DATETIME requires milliseconds ending in 0, 3, or 7 to avoid rounding.',
        { field: field.name },
      );
    const type = {
      date: 'date',
      time: 'time(3)',
      datetime: 'datetime2(3)',
      datetimeTz: 'datetimeoffset(3)',
    }[field.type as 'date' | 'time' | 'datetime' | 'datetimeTz'];
    return client.raw(`cast(? as ${type})`, [normalized]);
  }
  return normalized;
}

/** Format at the database boundary so driver Date parsing cannot apply a host zone. */
export function temporalProjection(
  client: Knex,
  field: FieldDefinition | undefined,
  reference: string | Knex.Raw,
): Knex.Raw | Knex.Ref<string, Record<string, string>> {
  const referenceExpression =
    typeof reference === 'string' ? client.ref(reference) : reference;
  if (!field || !isTemporalType(field.type)) return referenceExpression;
  assertPrecision(field);
  const engine = dialect(client);
  const instant = field.type === 'datetimeTz';
  if (engine === 'pg' || engine === 'postgres' || engine === 'postgresql') {
    const format =
      field.type === 'date'
        ? 'YYYY-MM-DD'
        : field.type === 'time'
          ? 'HH24:MI:SS.MS'
          : 'YYYY-MM-DD"T"HH24:MI:SS.MS';
    return client.raw(
      `to_char(${instant ? "?? at time zone 'UTC'" : '??'}, ?)${instant ? " || 'Z'" : ''}`,
      [reference, format],
    );
  }
  if (engine === 'mysql2' || engine === 'mysql') {
    const source =
      instant && /^timestamp(?:\(|$)/i.test(String(field.db?.nativeType))
        ? "convert_tz(??, @@session.time_zone, '+00:00')"
        : '??';
    const format =
      field.type === 'date'
        ? '%Y-%m-%d'
        : field.type === 'time'
          ? '%H:%i:%s.%f'
          : '%Y-%m-%dT%H:%i:%s.%f';
    const length = field.type === 'date' ? 10 : field.type === 'time' ? 12 : 23;
    const formatted = `left(date_format(${source}, ?), ${length})`;
    return client.raw(instant ? `concat(${formatted}, 'Z')` : formatted, [
      reference,
      format,
    ]);
  }
  if (engine === 'oracledb') {
    if (field.type === 'time') return referenceExpression;
    const format =
      field.type === 'date' ? 'YYYY-MM-DD' : 'YYYY-MM-DD"T"HH24:MI:SS.FF3';
    return client.raw(
      instant
        ? `case when ?? is null then null else to_char(sys_extract_utc(??), ?) || 'Z' end`
        : field.type === 'datetime'
          ? 'to_char(cast(?? as timestamp(3)), ?)'
          : 'to_char(??, ?)',
      instant ? [reference, reference, format] : [reference, format],
    );
  }
  if (engine === 'mssql') {
    if (field.type === 'date')
      return client.raw('convert(varchar(10), ??, 23)', [reference]);
    if (field.type === 'time')
      return client.raw('convert(varchar(12), cast(?? as time(3)), 114)', [
        reference,
      ]);
    return client.raw(
      instant
        ? "replace(convert(varchar(23), cast(switchoffset(??, '+00:00') as datetime2(3)), 121), ' ', 'T') + 'Z'"
        : "replace(convert(varchar(23), cast(?? as datetime2(3)), 121), ' ', 'T')",
      [reference],
    );
  }
  return referenceExpression;
}
