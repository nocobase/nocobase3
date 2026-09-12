import knex from 'knex';
import { expect, it } from 'vitest';
import driver from '../src/index.js';
import {
  DefaultFilterBuilder,
  attachDatabaseDriverRuntime,
  compileJsonCondition,
} from '@nocobase/db/testing';

it('keeps JSON paths immutable and all user SQL data bound', async () => {
  const json = new DefaultFilterBuilder().json('payload');
  const nested = json.path(['profile']);
  expect(json.eq({}).jsonPath).toBeUndefined();
  expect(nested.path(['name']).eq('x').jsonPath).toEqual(['profile', 'name']);
  expect(nested.eq({}).jsonPath).toEqual(['profile']);

  const client = knex({
    client: driver.driver.knexClient,
    useNullAsDefault: true,
  });
  attachDatabaseDriverRuntime(
    client,
    driver.driver.createRuntime!({
      dialect: driver.driver.dialect,
      sourceConfig: {} as never,
      config: {} as never,
      capabilities: (driver.driver.capabilities ?? {}) as never,
      getClient: () => client,
      resolveClient: async () => client,
    }),
  );
  try {
    const sql = compileJsonCondition(
      client,
      'payload',
      json.path(["a'); drop table test; --"]).eq("x' or 1=1 --"),
    ).toSQL();
    expect(sql.sql).not.toContain('drop table');
    expect(sql.sql).not.toContain('or 1=1');
    expect(sql.bindings.length).toBeGreaterThan(0);
  } finally {
    await client.destroy();
  }
});
