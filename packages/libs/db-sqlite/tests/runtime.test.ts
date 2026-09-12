import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import knex from 'knex';
import { describe, expect, it, vi } from 'vitest';
import sqlite from '../src/index.js';

function createRuntime() {
  const client = knex({ client: 'better-sqlite3', useNullAsDefault: true });
  const runtime = sqlite.driver.createRuntime!({
    dialect: 'sqlite',
    sourceConfig: {} as never,
    config: {} as never,
    capabilities: sqlite.driver.capabilities as never,
    getClient: () => client,
    resolveClient: async () => client,
  });
  return { client, runtime };
}

describe('sqlite runtime strategy', () => {
  it('installs SQLite decimal and integer functions on pooled connections', () => {
    const afterCreate = vi.fn();
    const pool = sqlite.driver.configurePool?.(
      {} as never,
      {
        afterCreate,
      } as never,
    ) as {
      afterCreate(connection: unknown, done: (error: unknown) => void): void;
    };
    const connection = {
      aggregate: vi.fn(),
      function: vi.fn(),
    };
    const done = vi.fn();

    pool.afterCreate(connection, done);

    expect(connection.aggregate).toHaveBeenCalledTimes(2);
    expect(connection.function).toHaveBeenCalledTimes(6);
    expect(afterCreate).toHaveBeenCalledWith(connection, done);
  });

  it('uses decimal helper functions for precise aggregates and ordering', () => {
    const { client, runtime } = createRuntime();
    const aggregate = runtime.numeric!.aggregateSql!({
      client,
      kind: 'sum',
      field: 'amount',
      distinct: true,
      source: { name: 'amount', type: 'decimal' } as never,
    });
    expect(aggregate.toQuery()).toContain('nb_decimal_sum');
    expect(aggregate.toQuery()).toContain('distinct');

    const ordering = runtime.query!.wrapAggregateOrdering!({
      client,
      ordering: client.raw('sum(??)', ['amount']),
      functionName: 'sum',
    });
    expect(ordering.toQuery()).toContain('nb_decimal_key');
    expect(
      runtime.numeric!.aggregateProjection!({
        client,
        expression: client.raw('sum(??)', ['amount']),
      }).toQuery(),
    ).toContain('nb_decimal_text');
  });

  it('encodes SQLite-specific boolean, integer mutation, enum and filter behavior', () => {
    const { client, runtime } = createRuntime();
    const repository = runtime.repository!;
    expect(repository.encodeBoolean!({} as never, true)).toBe(1);
    expect(repository.encodeBoolean!({} as never, false)).toBe(0);
    expect(repository.encodeBoolean!({} as never, null)).toBeNull();

    const mutation = repository.numericMutation!({
      client,
      field: { type: 'integer' } as never,
      name: 'quantity',
      operation: 'increment',
      operand: '9007199254740993',
    });
    expect(mutation?.toQuery()).toContain('nb_integer_increment');

    const enumKey = repository.enumGroupKey!({ client, field: 'status' });
    expect(enumKey.toQuery()).toContain('collate binary');
  });

  it('owns SQLite temporal storage and application path preparation', async () => {
    const { runtime } = createRuntime();
    expect(
      runtime.schema!.columnType!({
        column: { type: 'datetime' } as never,
        tablePrimaryKey: false,
      }),
    ).toBe('text');
    expect(
      sqlite.driver.normalizeConnection?.(
        {
          dialect: 'sqlite',
          database: 'nested/data.sqlite',
          filename: 'ignored.sqlite',
        } as never,
        { resolveStoragePath: (filename) => `/app/storage/${filename}` },
      ),
    ).toMatchObject({ filename: '/app/storage/nested/data.sqlite' });

    const root = await mkdtemp(path.join(tmpdir(), 'nocobase-db-sqlite-'));
    try {
      const filename = path.join(root, 'data', 'database.sqlite');
      expect(
        sqlite.driver.resolveOwnershipTarget?.({
          dialect: 'sqlite',
          filename,
        }),
      ).toEqual(['sqlite', path.resolve(filename)]);
      const directories: string[] = [];
      await sqlite.driver.prepareStorage?.(
        { dialect: 'sqlite', filename },
        {
          ensureDirectory: async (directory) => {
            directories.push(directory);
          },
        },
      );
      expect(directories).toEqual([path.dirname(filename)]);
      expect(
        sqlite.driver.resolveOwnershipTarget?.({
          dialect: 'sqlite',
          filename: ':memory:',
        }),
      ).toBeUndefined();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
