import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Knex } from 'knex';
import { expect, it } from 'vitest';
import {
  createDatabaseManager,
  transactionAuthority,
  type TransactionHandle,
} from '../../src/index.js';
import { describeIntegrationDatabases } from './helpers.js';

describeIntegrationDatabases(
  'Transaction commit failure recovery',
  (context) => {
    if (context.spec.dialect === 'sqlite') {
      it('quarantines a physically closed SQLite connection when commit and rollback both fail', async () => {
        const directory = await mkdtemp(
          join(tmpdir(), 'nocobase-managed-write-commit-'),
        );
        let validations = 0;
        const manager = createDatabaseManager({
          connections: {
            main: {
              dialect: 'sqlite',
              filename: join(directory, 'test.sqlite'),
              pool: {
                min: 0,
                max: 1,
                validate: () => {
                  validations++;
                  return true;
                },
              },
            },
          },
        });
        try {
          const connection = manager.connection();
          const client = await connection.client<Knex>();
          await client.schema.createTable('business', (builder) => {
            builder.integer('id');
          });
          await expect(
            connection.transaction(async (child) => {
              const transaction = await child.client<Knex>();
              await transaction('business').insert({ id: 42 });
              const native: { close(): void } =
                await transaction.client.acquireConnection();
              native.close();
            }),
          ).rejects.toThrow();
          expect(await client('business').select('id')).toEqual([]);
          await connection.transaction(async (child) => {
            await child.query
              .insertInto('business')
              .values({ id: 7 })
              .execute();
          });
          expect(await client('business').select('id')).toEqual([{ id: 7 }]);
          expect(validations).toBeGreaterThan(0);
        } finally {
          await manager.destroy();
          await rm(directory, { recursive: true, force: true });
        }
      });
    }
    if (context.spec.dialect !== 'mysql') {
      it('physically rolls back a deferred COMMIT failure before reusing the connection', async () => {
        const parent = context.table('parent');
        const child = context.table('child');
        await context.db.schema.createTable(parent, (builder) => {
          builder.integer('id').primary();
        });
        await context.db.raw(
          'create table ?? (id integer references ??(id) deferrable initially deferred)',
          [child, parent],
        );
        let calls = 0;
        let expired: TransactionHandle | undefined;
        await expect(
          context.database.transaction(async (connection) => {
            calls++;
            expired = transactionAuthority.current(connection);
            const client = await connection.client<Knex>();
            await client(child).insert({ id: 42 });
            expect(await client(child).select('id')).toEqual([{ id: 42 }]);
          }),
        ).rejects.toThrow();
        expect(calls).toBe(1);
        expect(await context.db(child).select('id')).toEqual([]);
        expect(() =>
          transactionAuthority.validate(expired!, expired!.connection),
        ).toThrow();
        await context.database.transaction(async (connection) => {
          const client = await connection.client<Knex>();
          await client(parent).insert({ id: 7 });
          await client(child).insert({ id: 7 });
        });
        expect(await context.db(child).select('id')).toEqual([{ id: 7 }]);
      });
    }
    if (context.spec.dialect !== 'sqlite') {
      it('discards a connection lost immediately before commit and permits fresh transactions', async () => {
        const table = context.table('business');
        await context.db.schema.createTable(table, (builder) => {
          builder.integer('id').primary();
        });
        let calls = 0;
        await expect(
          context.database.transaction(async (connection) => {
            calls++;
            const client = await connection.client<Knex>();
            await client(table).insert({ id: 42 });
            if (context.spec.dialect === 'postgres') {
              const result: { rows: { id: number }[] } = await client.raw(
                'select pg_backend_pid() as id',
              );
              await context.db.raw('select pg_terminate_backend(?)', [
                result.rows[0].id,
              ]);
            } else {
              const result = await client.raw<[{ id: number }[], unknown]>(
                'select connection_id() as id',
              );
              await context.db.raw('kill connection ?', [result[0][0].id]);
            }
          }),
        ).rejects.toThrow();
        expect(calls).toBe(1);
        expect(await context.db(table).select('id')).toEqual([]);
        await context.database.transaction(async (connection) => {
          await connection.query.insertInto(table).values({ id: 7 }).execute();
        });
        expect(await context.db(table).select('id')).toEqual([{ id: 7 }]);
      });
    }
  },
);
