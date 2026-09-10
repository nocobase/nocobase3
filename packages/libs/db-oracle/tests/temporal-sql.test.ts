import knex from 'knex';
import { describe, expect, it } from 'vitest';
import oracle from '../src/index.js';
import {
  attachDatabaseDriverRuntime,
  temporalBinding,
  temporalProjection,
} from '@nocobase/db/testing';

describe('Oracle temporal SQL boundaries', () => {
  it('rejects precision loss before SQL is executed', async () => {
    const client = knex({ client: 'oracledb' });
    attachDatabaseDriverRuntime(
      client,
      oracle.driver.createRuntime!({
        dialect: 'oracle',
        sourceConfig: {} as never,
        config: {} as never,
        capabilities: (oracle.driver.capabilities ?? {}) as never,
        getClient: () => client,
        resolveClient: async () => client,
      }),
    );
    const field = {
      name: 'occurredAt',
      type: 'datetimeTz',
      fractionalSecondsPrecision: 6,
    };
    expect(() => temporalProjection(client, field, field.name)).toThrow(
      expect.objectContaining({ code: 'FIELD_CAPABILITY_NOT_SUPPORTED' }),
    );
    expect(() =>
      temporalBinding(client, field, '2026-09-06T12:30:00Z'),
    ).toThrow(
      expect.objectContaining({ code: 'FIELD_CAPABILITY_NOT_SUPPORTED' }),
    );
    expect(() =>
      temporalBinding(
        client,
        { ...field, fractionalSecondsPrecision: 0 },
        '2026-09-06T12:30:00.001Z',
      ),
    ).toThrow(expect.objectContaining({ code: 'INVALID_MUTATION' }));
    await client.destroy();
  });

  it('preserves null instants before appending the UTC suffix', async () => {
    const client = knex({ client: 'oracledb' });
    attachDatabaseDriverRuntime(
      client,
      oracle.driver.createRuntime!({
        dialect: 'oracle',
        sourceConfig: {} as never,
        config: {} as never,
        capabilities: (oracle.driver.capabilities ?? {}) as never,
        getClient: () => client,
        resolveClient: async () => client,
      }),
    );
    const expression = temporalProjection(
      client,
      { name: 'occurredAt', type: 'datetimeTz' },
      'occurredAt',
    );
    expect(expression.toQuery()).toContain('case when');
    expect(expression.toQuery()).toContain('is null then null');
    expect(expression.toQuery()).toContain('sys_extract_utc');
    await client.destroy();
  });
});
