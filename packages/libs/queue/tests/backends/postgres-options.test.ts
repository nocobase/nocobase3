import { PostgresConnection } from 'bullmq';
import { Pool, type PoolConfig } from 'pg';
import { describe, expect, it, vi } from 'vitest';
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
  it('preserves explicit session options and application identity', () => {
    const input = Object.freeze({
      options: '-c timezone=UTC',
      application_name: 'queue-app',
    });
    expect(resolvePostgresConnection(input)).toMatchObject(input);
  });
  it.each([false, true])(
    'preserves ordinary PoolConfig options (flags=%s)',
    (flag) => {
      const password = vi.fn(async () => 'rotating-secret');
      const input = Object.freeze({
        idleTimeoutMillis: 0,
        keepAlive: flag,
        ssl: false,
        password,
        min: 0,
        maxUses: 100,
        maxLifetimeSeconds: 60,
        keepAliveInitialDelayMillis: 500,
        allowExitOnIdle: flag,
        enableChannelBinding: flag,
        fallback_application_name: 'queue-fallback',
        client_encoding: 'UTF8',
        query_timeout: 300,
        lock_timeout: 500,
        idle_in_transaction_session_timeout: 1000,
      } satisfies PoolConfig);
      expect(resolvePostgresConnection(input)).toMatchObject(input);
      expect(password).not.toHaveBeenCalled();
    },
  );
  it('preserves synchronous password providers, TLS options and disabled idle expiration', () => {
    const password = vi.fn(() => 'secret');
    const ssl = Object.freeze({
      rejectUnauthorized: true,
      servername: 'pg.example',
    });
    expect(
      resolvePostgresConnection({ password, ssl, idleTimeoutMillis: null }),
    ).toMatchObject({ password, ssl, idleTimeoutMillis: null });
    expect(password).not.toHaveBeenCalled();
  });
  it.each([false, 0, 2000, 20000])(
    'preserves driver statement_timeout=%s independently of the owned producer deadline',
    (statement_timeout) => {
      expect(
        resolvePostgresConnection({
          statement_timeout,
          connectionTimeoutMillis: 0,
        }),
      ).toMatchObject({ statement_timeout, connectionTimeoutMillis: 0 });
    },
  );
  it('passes password providers and ordinary settings through the official factory to a real unconnected pg Pool', async () => {
    const password = vi.fn(async () => 'secret');
    const input = Object.freeze({
      host: 'not-contacted.example',
      ssl: false,
      keepAlive: true,
      idleTimeoutMillis: 25,
      password,
    } satisfies PoolConfig);
    const connection = new PostgresConnection(resolvePostgresConnection(input));
    try {
      expect(connection.pool).toBeInstanceOf(Pool);
      if (!(connection.pool instanceof Pool))
        throw new Error('Expected pg Pool');
      expect(connection.pool.options).toMatchObject(input);
      expect(connection.pool.totalCount).toBe(0);
      expect(password).not.toHaveBeenCalled();
    } finally {
      await connection.close();
    }
  });
  it('preserves typed Pool hooks that B6 does not forbid without calling them', () => {
    const getTypeParser = vi.fn(() => (value: string) => value);
    const log = vi.fn();
    const input = Object.freeze({
      types: { getTypeParser },
      log,
      Promise,
      maxUses: Infinity,
    } satisfies PoolConfig);
    expect(resolvePostgresConnection(input)).toMatchObject(input);
    expect(getTypeParser).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });
  it('leaves driver-owned scalar extensions open', () => {
    expect(
      resolvePostgresConnection({ driverSpecificFlag: true }),
    ).toMatchObject({ driverSpecificFlag: true });
  });
  it.each([
    { schema: 'bad-name' },
    { skipVersionCheck: 'true' },
    { max: 0 },
    { port: 65536 },
    { connectionTimeoutMillis: -1 },
    { Client: class {} },
    { keepAlive: 'true' },
    { ssl: 'false' },
    { ssl: { rejectUnauthorized: 'false' } },
    { ssl: { servername: 1 } },
    { constructor: {} },
    JSON.parse('{"__proto__":{"host":"wrong-target"}}'),
    { idleTimeoutMillis: -1 },
    { idleTimeoutMillis: Infinity },
    { password: Promise.resolve('secret') },
    { password: 1 },
    { stream: () => undefined },
    { migrate: false },
    { skipMigrations: true },
    { borrowedPool: {} },
    { query_timeout: NaN },
    { types: {} },
    { onConnect: () => {} },
    { verify: () => {} },
    { host: 42 },
  ])('rejects unsafe or malformed input %j', (value) => {
    expect(() => resolvePostgresConnection(value)).toThrow();
  });
});
