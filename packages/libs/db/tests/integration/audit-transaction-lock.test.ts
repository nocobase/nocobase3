import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Knex } from 'knex';
import { expect, it } from 'vitest';
import {
  createDatabaseManager,
  type ConnectionConfig,
} from '../../src/index.js';
import { describeIntegrationDatabases } from './helpers.js';

describeIntegrationDatabases('Audit transaction lock conflicts', (context) => {
  it('executes the callback once when a real competing write times out', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'nocobase-g02-'));
    const config: ConnectionConfig =
      context.spec.dialect === 'sqlite'
        ? {
            dialect: 'sqlite',
            driver: 'better-sqlite3',
            filename: join(directory, 'lock.sqlite'),
          }
        : {
            ...(context.spec.dialect === 'postgres'
              ? ({ dialect: 'postgres', driver: 'pg' } as const)
              : ({ dialect: 'mysql', driver: 'mysql2' } as const)),
            host: context.spec.host ?? '127.0.0.1',
            port: context.spec.port,
            username: context.spec.username,
            password: context.spec.password,
            database: context.spec.database,
          };
    const database = createDatabaseManager({
      connections: { blocker: config, contender: config },
    });
    const table = context.table('lock_conflict');
    const blocker = await database.connection('blocker').client<Knex>();
    const contender = await database.connection('contender').client<Knex>();
    let transaction: Knex.Transaction | undefined;
    let calls = 0;
    try {
      await blocker.schema.createTable(table, (builder) => {
        builder.integer('id').primary();
        builder.integer('value');
      });
      await blocker(table).insert({ id: 1, value: 0 });
      if (context.spec.dialect === 'sqlite')
        await contender.raw('PRAGMA busy_timeout = 25');
      transaction = await blocker.transaction();
      await transaction(table).where({ id: 1 }).update({ value: 1 });
      // An outside query still uses its own connection and sees committed data.
      expect(
        await database
          .query('contender')
          .selectFrom(table)
          .selectAll()
          .execute(),
      ).toEqual([{ id: 1, value: 0 }]);
      await expect(
        database.transaction(async (connection) => {
          calls++;
          const client = await connection.client<Knex>();
          if (context.spec.dialect === 'postgres')
            await client.raw("SET LOCAL lock_timeout = '50ms'");
          if (context.spec.dialect === 'mysql')
            await client.raw('SET SESSION innodb_lock_wait_timeout = 1');
          await connection.query
            .updateTable(table)
            .set({ value: 2 })
            .where('id', '=', 1)
            .execute();
        }, 'contender'),
      ).rejects.toThrow(/locked|lock timeout|lock wait timeout/i);
      expect(calls).toBe(1);
      await transaction.rollback();
      transaction = undefined;
      expect(
        await blocker<{ id: number; value: number }>(table).first(),
      ).toEqual({ id: 1, value: 0 });
    } finally {
      if (transaction) await transaction.rollback();
      await blocker.schema.dropTableIfExists(table);
      await database.destroy();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
