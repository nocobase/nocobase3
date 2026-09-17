import { describe, expect, it } from 'vitest';
import { resolvePostgresConnection } from '../../src/backends/postgres.js';

describe('owned PostgreSQL connection options', () => {
  it('copies supported options without mutating the caller', () => {
    const input = Object.freeze({
      host: 'localhost',
      schema: 'custom_queue',
      max: 2,
    });
    expect(resolvePostgresConnection(input)).toEqual({
      ...input,
      migrate: true,
      connectionTimeoutMillis: 1000,
      statement_timeout: 10000,
    });
    expect(input).toEqual({
      host: 'localhost',
      schema: 'custom_queue',
      max: 2,
    });
  });
  it('accepts connection strings and explicit version-check opt out', () => {
    expect(
      resolvePostgresConnection('postgres://localhost/queue').connectionString,
    ).toBe('postgres://localhost/queue');
    expect(
      resolvePostgresConnection({ skipVersionCheck: true }).skipVersionCheck,
    ).toBe(true);
  });
  it.each([
    { schema: 'bad-name' },
    { skipVersionCheck: 'true' },
    { max: 0 },
    { port: 65536 },
    { connectionTimeoutMillis: 0 },
    { Client: class {} },
    { arbitrary: true },
    { host: 42 },
  ])('rejects unsafe or malformed input %j', (value) => {
    expect(() => resolvePostgresConnection(value)).toThrow();
  });
});
