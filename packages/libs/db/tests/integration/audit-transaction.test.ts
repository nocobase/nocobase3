import type { Knex } from 'knex';
import { beforeEach, expect, it } from 'vitest';
import {
  createDatabaseManager,
  transactionAuthority,
  type DatabaseConnection,
  type TransactionHandle,
} from '../../src/index.js';
import { describeIntegrationDatabases } from './helpers.js';

function handle(connection: DatabaseConnection): TransactionHandle {
  const value = transactionAuthority.current(connection);
  expect(value).toBeDefined();
  if (!value) throw new Error('Expected an active transaction.');
  return value;
}

describeIntegrationDatabases('Audit transaction authority', (context) => {
  let table: string;
  let markers: string;
  beforeEach(async () => {
    table = context.table('business');
    markers = context.table('markers');
    for (const name of [table, markers]) {
      await context.db.schema.createTable(name, (builder) => {
        builder.integer('id').primary();
      });
    }
  });

  const insert = async (
    connection: DatabaseConnection,
    id: number,
    name = table,
  ): Promise<void> => {
    await connection.query.insertInto(name).values({ id }).execute();
  };
  const ids = async (): Promise<number[]> => {
    const rows = await context
      .db<{ id: number }>(table)
      .select('id')
      .orderBy('id');
    return rows.map((row) => row.id);
  };

  it('commits the original result and rolls back explicit throws without rerunning callbacks', async () => {
    const result = { result: 42 };
    let calls = 0;
    expect(
      await context.database.transaction(async (connection) => {
        calls++;
        await insert(connection, 1);
        return result;
      }),
    ).toBe(result);
    expect(calls).toBe(1);
    await expect(
      context.database.transaction(async (connection) => {
        calls++;
        await insert(connection, 2);
        throw new Error('Synthetic business failure');
      }),
    ).rejects.toThrow('Synthetic business failure');
    expect(calls).toBe(2);
    expect(await ids()).toEqual([1]);
  });

  it('poisons every ancestor through nested savepoints even when every callback catches and returns', async () => {
    const calls = [0, 0, 0];
    await expect(
      context.database.transaction(async (outer) => {
        calls[0]++;
        const rootHandle = handle(outer);
        await insert(outer, 1);
        await expect(
          outer.transaction(async (middle) => {
            calls[1]++;
            expect(handle(middle).managerId).toBe(rootHandle.managerId);
            expect(handle(middle).connectionId).toBe(rootHandle.connectionId);
            expect(handle(middle).transactionId).not.toBe(
              rootHandle.transactionId,
            );
            await insert(middle, 2);
            await expect(
              middle.transaction(async (inner) => {
                calls[2]++;
                await insert(inner, 3);
                await insert(inner, 1, markers);
                transactionAuthority.markRollbackOnly(handle(inner));
                return 'caught';
              }),
            ).rejects.toThrow('rollback-only');
            await insert(middle, 4);
          }),
        ).rejects.toThrow('rollback-only');
        await insert(outer, 5);
      }),
    ).rejects.toThrow('rollback-only');
    expect(calls).toEqual([1, 1, 1]);
    expect(await ids()).toEqual([]);
    expect(await context.db(markers).select('*')).toEqual([]);
  });

  it('preserves ordinary savepoint rollback and permits the outer transaction to commit', async () => {
    await context.database.transaction(async (outer) => {
      await insert(outer, 1);
      await expect(
        outer.transaction(async (inner) => {
          await insert(inner, 2);
          throw new Error('Ordinary savepoint failure');
        }),
      ).rejects.toThrow('Ordinary savepoint failure');
      await insert(outer, 3);
    });
    expect(await ids()).toEqual([1, 3]);
  });

  it('rejects copied, forged, cross-connection and cross-manager handles with safe errors', async () => {
    const other = createDatabaseManager({
      connections: {
        first: {
          dialect: 'sqlite',
          driver: 'better-sqlite3',
          filename: ':memory:',
        },
        second: {
          dialect: 'sqlite',
          driver: 'better-sqlite3',
          filename: ':memory:',
        },
      },
    });
    try {
      await context.database.transaction(async (connection) => {
        const value = handle(connection);
        expect(Object.isFrozen(value)).toBe(true);
        expect(() =>
          transactionAuthority.validate(value, connection),
        ).not.toThrow();
        expect(
          transactionAuthority.current(context.database.connection()),
        ).toBeUndefined();
        const copied = { ...value };
        expect(() => transactionAuthority.validate(copied, connection)).toThrow(
          'Invalid or inactive',
        );
        expect(() => transactionAuthority.markRollbackOnly(copied)).toThrow(
          'Invalid or inactive',
        );
        expect(() =>
          transactionAuthority.validate(value, context.database.connection()),
        ).toThrow('Invalid or inactive');
        await other.transaction(async (foreign) => {
          expect(handle(foreign).managerId).not.toBe(value.managerId);
          expect(() => transactionAuthority.validate(value, foreign)).toThrow(
            'Invalid or inactive',
          );
        });
        await other.transaction(async (first) => {
          await other.transaction(async (second) => {
            expect(handle(first).managerId).toBe(handle(second).managerId);
            expect(handle(first).connectionId).not.toBe(
              handle(second).connectionId,
            );
            expect(() =>
              transactionAuthority.validate(handle(first), second),
            ).toThrow('Invalid or inactive');
          }, 'second');
        }, 'first');
        const forged = Object.create(null) as TransactionHandle;
        Object.defineProperty(forged, 'connection', {
          get() {
            throw new Error('SYNTHETIC_SQL_BINDING_SECRET');
          },
        });
        expect(() => transactionAuthority.validate(forged, connection)).toThrow(
          'Invalid or inactive',
        );
      });
    } finally {
      await other.destroy();
    }
  });

  it('expires committed, rolled-back and released savepoint handles', async () => {
    const values: TransactionHandle[] = [];
    await context.database.transaction(async (connection) => {
      values.push(handle(connection));
      await connection.transaction(async (child) => {
        values.push(handle(child));
      });
      expect(
        transactionAuthority.current(values[1]!.connection),
      ).toBeUndefined();
    });
    await expect(
      context.database.transaction(async (connection) => {
        values.push(handle(connection));
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    for (const value of values) {
      expect(transactionAuthority.current(value.connection)).toBeUndefined();
      expect(() =>
        transactionAuthority.validate(value, value.connection),
      ).toThrow('Invalid or inactive');
      expect(() => transactionAuthority.markRollbackOnly(value)).toThrow(
        'Invalid or inactive',
      );
      await expect(value.connection.connect()).rejects.toThrow(
        'Invalid or inactive',
      );
    }
  });

  it('does not destroy the shared pool through transaction disconnect or reconnect', async () => {
    await context.database.transaction(async (connection) => {
      await expect(connection.disconnect()).rejects.toThrow(
        'Cannot disconnect',
      );
      await expect(connection.reconnect()).rejects.toThrow('Cannot disconnect');
      await insert(connection, 1);
    });
    expect(await ids()).toEqual([1]);
    expect(await context.db.raw('select 1')).toBeDefined();
  });

  it('rejects a direct adapter commit after rollback-only was marked', async () => {
    await expect(
      context.database.transaction(async (connection) => {
        await insert(connection, 1);
        transactionAuthority.markRollbackOnly(handle(connection));
        const trx = await connection.client<Knex.Transaction>();
        await trx.commit();
      }),
    ).rejects.toThrow('rollback-only');
    expect(await ids()).toEqual([]);
  });

  it('rolls back a real failed marker insert without rerunning the callback', async () => {
    let calls = 0;
    await expect(
      context.database.transaction(async (connection) => {
        calls++;
        await insert(connection, 1);
        await insert(connection, 1, markers);
        try {
          await insert(connection, 1, markers);
        } catch {
          transactionAuthority.markRollbackOnly(handle(connection));
        }
        return 'caught duplicate';
      }),
    ).rejects.toThrow('rollback-only');
    expect(calls).toBe(1);
    expect(await ids()).toEqual([]);
    expect(await context.db(markers).select('*')).toEqual([]);
  });

  it('still rejects rollback-only when a caller manually rolls back without an error', async () => {
    await expect(
      context.database.transaction(async (connection) => {
        await insert(connection, 1);
        transactionAuthority.markRollbackOnly(handle(connection));
        const trx = await connection.client<Knex.Transaction>();
        await trx.rollback();
        return 'caught';
      }),
    ).rejects.toThrow('rollback-only');
    expect(await ids()).toEqual([]);
  });

  it('prevents early adapter commit from escaping a later callback failure', async () => {
    await expect(
      context.database.transaction(async (connection) => {
        await insert(connection, 1);
        const trx = await connection.client<Knex.Transaction>();
        await trx.commit();
        throw new Error('Synthetic late callback failure');
      }),
    ).rejects.toThrow('Transaction commit is managed by the callback.');
    expect(await ids()).toEqual([]);
  });

  it('retains the owner across reconnect while issuing a new active transaction identity', async () => {
    const first = await context.database.transaction(async (connection) =>
      handle(connection),
    );
    await context.database.reconnect();
    context.db = await context.database.connection().client<Knex>();
    await context.database.transaction(async (connection) => {
      const second = handle(connection);
      expect(second.managerId).toBe(first.managerId);
      expect(second.connectionId).toBe(first.connectionId);
      expect(second.transactionId).not.toBe(first.transactionId);
      expect(() => transactionAuthority.validate(first, connection)).toThrow(
        'Invalid or inactive',
      );
      expect(transactionAuthority.current(first.connection)).toBeUndefined();
      expect(
        transactionAuthority.current(context.database.connection()),
      ).toBeUndefined();
    });
  });
});
