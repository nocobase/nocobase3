import knex from 'knex';
import { describe, expect, it } from 'vitest';
import mssql from '../src/index.js';
import {
  attachDatabaseDriverRuntime,
  temporalBinding,
} from '@nocobase/db/testing';

describe('SQL Server temporal SQL boundaries', () => {
  it('rejects legacy SQL Server range and precision loss', async () => {
    const client = knex({ client: 'mssql' });
    attachDatabaseDriverRuntime(
      client,
      mssql.driver.createRuntime!({
        dialect: 'mssql',
        sourceConfig: {} as never,
        config: {} as never,
        capabilities: (mssql.driver.capabilities ?? {}) as never,
        getClient: () => client,
        resolveClient: async () => client,
      }),
    );
    const field = {
      name: 'occurredAt',
      type: 'datetime',
      db: { nativeType: 'datetime' },
    };
    for (const value of [
      '1752-12-31T23:59:59.000',
      '2026-09-06T12:30:00.001',
      '9999-12-31T23:59:59.999',
    ]) {
      expect(() => temporalBinding(client, field, value)).toThrow(
        expect.objectContaining({ code: 'INVALID_MUTATION' }),
      );
    }
    expect(
      temporalBinding(client, field, '2026-09-06T12:30:00.003'),
    ).toHaveProperty('bindings', ['2026-09-06T12:30:00.003']);

    const minuteField = { ...field, db: { nativeType: 'smalldatetime' } };
    for (const value of [
      '1899-12-31T23:59:00.000',
      '2026-09-06T12:30:01.000',
      '2079-06-07T00:00:00.000',
    ]) {
      expect(() => temporalBinding(client, minuteField, value)).toThrow(
        expect.objectContaining({ code: 'INVALID_MUTATION' }),
      );
    }
    expect(
      temporalBinding(client, minuteField, '2026-09-06T12:30:00.000'),
    ).toHaveProperty('bindings', ['2026-09-06T12:30:00.000']);
    await client.destroy();
  });
});
