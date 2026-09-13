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

  it('renders safe temporal literals for Oracle single-row writes', async () => {
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

    for (const [type, value, fragment] of [
      ['date', '2026-09-06', "to_date('2026-09-06'"],
      [
        'datetime',
        '2026-09-06T09:30:00.120',
        "to_timestamp('2026-09-06T09:30:00.120'",
      ],
      [
        'datetimeTz',
        '2026-09-06T01:30:00.120Z',
        "to_timestamp_tz('2026-09-06T01:30:00.120+00:00'",
      ],
    ] as const) {
      const expression = temporalBinding(
        client,
        { name: 'occurredAt', type },
        value,
      );
      if (!expression || typeof expression === 'string')
        throw new Error('Expected a Knex raw temporal expression.');
      expect(expression.toQuery()).toContain(fragment);
      expect(expression.toQuery()).not.toContain('?');
    }

    await client.destroy();
  });
});
