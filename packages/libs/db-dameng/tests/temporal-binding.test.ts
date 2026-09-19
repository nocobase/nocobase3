import type { Knex } from 'knex';
import { expect, it } from 'vitest';
import dameng from '../src/index.js';
import knex from 'knex';
import {
  attachDatabaseDriverRuntime,
  temporalBinding,
} from '@nocobase/db/testing';

class FakeBaseClient {
  prepBindings(bindings: readonly unknown[]): unknown[] {
    return [...bindings];
  }
}

const Client = dameng.driver.createKnexClient?.(
  {} as never,
  FakeBaseClient as unknown as typeof Knex.Client,
) as unknown as new () => {
  prepBindings(bindings: readonly unknown[]): unknown[];
};

it('binds ISO-8601 instants as Date so dmdb sends a native DATETIME', () => {
  const client = new Client();
  const prepared = client.prepBindings([
    '2026-09-11T08:55:19.260Z',
    '2026-09-11T08:55:19Z',
    '2026-09-11T08:55:19.260',
    '2026-09-11 08:55:19.260',
    'plain',
  ]);

  expect(prepared[0]).toBeInstanceOf(Date);
  expect((prepared[0] as Date).toISOString()).toBe('2026-09-11T08:55:19.260Z');
  expect(prepared[1]).toBeInstanceOf(Date);
  expect(prepared[2]).toBe('2026-09-11T08:55:19.260');
  expect(prepared[3]).toBe('2026-09-11 08:55:19.260');
  expect(prepared[4]).toBe('plain');
});

it('leaves non-instant bindings untouched', () => {
  const client = new Client();
  const date = new Date('2026-09-11T08:55:19.260Z');
  const prepared = client.prepBindings([date, 42, null, true]);
  expect(prepared[0]).toBe(date);
  expect(prepared[1]).toBe(42);
  expect(prepared[2]).toBeNull();
  expect(prepared[3]).toBe(true);
});

it('renders safe temporal literals for Dameng single-row writes', async () => {
  const client = knex({ client: 'sqlite3' });
  attachDatabaseDriverRuntime(
    client,
    dameng.driver.createRuntime!({
      dialect: 'dameng',
      sourceConfig: {} as never,
      config: {} as never,
      capabilities: (dameng.driver.capabilities ?? {}) as never,
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
