import knex from 'knex';
import { expect, it } from 'vitest';
import {
  compileJsonCondition,
  validateJsonCondition,
} from '../../../../src/repository/json-filter.js';
import { DefaultFilterBuilder } from '../../../../src/repository/filter-builder.js';

it('keeps JSON paths immutable and all user SQL data bound', () => {
  const json = new DefaultFilterBuilder().json('payload');
  const nested = json.path(['profile']);
  expect(json.eq({}).jsonPath).toBeUndefined();
  expect(nested.path(['name']).eq('x').jsonPath).toEqual(['profile', 'name']);
  expect(nested.eq({}).jsonPath).toEqual(['profile']);
  for (const client of ['pg', 'mysql2', 'better-sqlite3']) {
    const db = knex({ client, useNullAsDefault: true });
    const sql = compileJsonCondition(
      db,
      'payload',
      json.path(["a'); drop table test; --"]).eq("x' or 1=1 --"),
    ).toSQL();
    expect(sql.sql).not.toContain('drop table');
    expect(sql.sql).not.toContain('or 1=1');
    expect(sql.bindings.length).toBeGreaterThan(0);
  }
});

it('rejects non-JSON operands and malformed JSON operations', () => {
  const json = new DefaultFilterBuilder().json('payload');
  const circular: Record<string, unknown> = {};
  circular.self = circular;
  for (const value of [
    undefined,
    Infinity,
    NaN,
    new Date(),
    circular,
    { a: undefined },
  ]) {
    expect(() =>
      validateJsonCondition({ ...json.eq(null), value: value as never }, []),
    ).toThrow();
  }
  expect(() =>
    validateJsonCondition({ ...json.has(null), value: {} }, []),
  ).toThrow();
  expect(() =>
    validateJsonCondition({ ...json.isEmpty(), value: 1 }, []),
  ).toThrow();
  expect(() => validateJsonCondition(json.path([]).eq(null), [])).toThrow();
});
