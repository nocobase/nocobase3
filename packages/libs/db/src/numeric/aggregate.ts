import type { RepositoryMutationScalarValue } from '../repository/types.js';
import type { Knex } from 'knex';
import type { FieldDefinition } from '../collection/types.js';
import { decodeIntegerValue } from '../repository/integer.js';
import { RepositoryError } from '../repository/errors.js';
import { decimalString, normalizeDecimal } from './decimal.js';
import { getDatabaseDriverRuntime } from '../database/runtime.js';

export type NumericAggregate = 'count' | 'sum' | 'avg' | 'min' | 'max';

export function aggregateSql(
  client: Knex,
  kind: NumericAggregate,
  field: string,
  distinct = false,
  source?: FieldDefinition,
): Knex.Raw {
  const strategy = getDatabaseDriverRuntime(client)?.numeric;
  if (strategy?.aggregateSql) {
    return strategy.aggregateSql({
      client,
      kind,
      field,
      distinct,
      source,
    });
  }
  const operand = field === '*' ? client.raw('*') : client.ref(field);
  const prefix = distinct ? 'distinct ' : '';
  if (kind === 'count') return client.raw(`count(${prefix}?)`, [operand]);
  return client.raw(`${kind}(${prefix}?)`, [operand]);
}

/** Drivers that already transport BIGINT and DECIMAL as strings. */
export function hasNativeNumericResults(client: Knex): boolean {
  return getDatabaseDriverRuntime(client)?.numeric?.hasNativeResults ?? false;
}

/** Apply only at a result boundary; comparisons must retain numeric SQL types. */
export function aggregateProjection(
  client: Knex,
  expression: Knex.Raw,
  source?: FieldDefinition,
): Knex.Raw {
  const strategy = getDatabaseDriverRuntime(client)?.numeric;
  if (
    hasNativeNumericResults(client) ||
    (source && ['float', 'double'].includes(source.type))
  )
    return expression;
  if (strategy?.aggregateProjection) {
    return strategy.aggregateProjection({ client, expression, source });
  }
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
