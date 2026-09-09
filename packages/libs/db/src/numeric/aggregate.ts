import type { RepositoryMutationScalarValue } from '../repository/types.js';
import type { Knex } from 'knex';
import type { FieldDefinition } from '../collection/types.js';
import { decodeIntegerValue } from '../repository/integer.js';
import { RepositoryError } from '../repository/errors.js';
import { decimalString, normalizeDecimal } from './decimal.js';

export type NumericAggregate = 'count' | 'sum' | 'avg' | 'min' | 'max';

export function aggregateSql(
  client: Knex,
  kind: NumericAggregate,
  field: string,
  distinct = false,
  source?: FieldDefinition,
): Knex.Raw {
  const dialect = client.client.config.client;
  const operand = field === '*' ? client.raw('*') : client.ref(field);
  const prefix = distinct ? 'distinct ' : '';
  if (kind === 'count')
    return client.raw(
      `${dialect === 'mssql' ? 'count_big' : 'count'}(${prefix}?)`,
      [operand],
    );
  const floating = source && ['float', 'double'].includes(source.type);
  if (
    !floating &&
    (kind === 'avg' || kind === 'sum') &&
    dialect === 'better-sqlite3'
  )
    return client.raw(`nb_decimal_${kind}(${prefix}?)`, [operand]);
  if (!floating && (kind === 'avg' || kind === 'sum') && dialect === 'mssql') {
    // DECIMAL aggregates already widen to precision 38. Integral inputs need
    // promotion before AVG (fractional results) and SUM (int64 overflow).
    if (source?.type === 'decimal')
      return client.raw(`${kind}(${prefix}?)`, [operand]);
    return client.raw(`${kind}(${prefix}cast(? as decimal(38,0)))`, [operand]);
  }
  return client.raw(`${kind}(${prefix}?)`, [operand]);
}

/** Drivers that already transport BIGINT and DECIMAL as strings. */
export function hasNativeNumericResults(client: Knex): boolean {
  return ['pg', 'mysql2'].includes(client.client.config.client);
}

/** Apply only at a result boundary; comparisons must retain numeric SQL types. */
export function aggregateProjection(
  client: Knex,
  expression: Knex.Raw,
  source?: FieldDefinition,
): Knex.Raw {
  if (
    hasNativeNumericResults(client) ||
    (source && ['float', 'double'].includes(source.type))
  )
    return expression;
  const dialect = client.client.config.client;
  if (dialect === 'oracledb')
    return client.raw(`to_char(?, 'TM9', 'NLS_NUMERIC_CHARACTERS=''.,''')`, [
      expression,
    ]);
  if (dialect === 'better-sqlite3')
    return client.raw('nb_decimal_text(?)', [expression]);
  if (dialect === 'mssql')
    return client.raw('cast(? as varchar(max))', [expression]);
  return client.raw('cast(? as text)', [expression]);
}

export function decodeAggregate(
  kind: NumericAggregate,
  value: unknown,
  source?: FieldDefinition,
): RepositoryMutationScalarValue {
  if (kind === 'count') return decodeCount(value);
  if (value == null) return null;
  if (kind === 'sum' || kind === 'avg') {
    if (source && ['float', 'double'].includes(source.type))
      return Number(value);
    // Native PG/MySQL metadata already distinguishes exact and floating types.
    return source
      ? decimalString(value)
      : (value as RepositoryMutationScalarValue);
  }
  if (source && ['bigInt', 'integer', 'increments'].includes(source.type))
    return decodeIntegerValue(source, value);
  if (source && ['float', 'double'].includes(source.type)) return Number(value);
  if (source?.type === 'decimal') return decimalString(value);
  return value as RepositoryMutationScalarValue;
}

/** Validate exact transport before converting a count to a JavaScript number. */
export function decodeCount(value: unknown): number {
  const text = normalizeDecimal(value ?? '0');
  if (text === null || !/^\d+$/.test(text)) {
    throw new RepositoryError(
      'INVALID_STORED_VALUE',
      'COUNT must be a non-negative integer.',
    );
  }
  if (BigInt(text) > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RepositoryError(
      'INVALID_STORED_VALUE',
      'COUNT exceeds the JavaScript safe integer range.',
      {
        details: {
          aggregate: 'count',
          value: text,
          maximum: Number.MAX_SAFE_INTEGER,
        },
      },
    );
  }
  return Number(text);
}
