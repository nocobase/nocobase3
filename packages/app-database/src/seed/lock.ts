import type { Knex } from 'knex';
import type { MigrationConnection } from '../migration/types.js';

export const DEFAULT_SEED_LOCK_TABLE = '__nocobase_seed_lock';

const inProcessSeedLocks = new Set<string>();

export async function withSeedLock<T>(
  connection: MigrationConnection,
  options: { tableName?: string },
  fn: () => Promise<T>,
): Promise<T> {
  const tableName = options.tableName ?? DEFAULT_SEED_LOCK_TABLE;
  const lockKey = `${connection.name}:${tableName}`;
  if (inProcessSeedLocks.has(lockKey)) {
    throw new Error(
      `Seed lock "${tableName}" is already held for connection "${connection.name}".`,
    );
  }

  inProcessSeedLocks.add(lockKey);
  const owner = `${process.pid}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  let acquired = false;

  try {
    await ensureSeedLockTable(connection, tableName);
    const knex = await connection.client<Knex>();
    try {
      await knex(tableName).insert({
        id: 1,
        locked_by: owner,
        locked_at: new Date(),
      });
    } catch (error) {
      const existing = await knex(tableName).where({ id: 1 }).first();
      if (existing) {
        throw new Error(`Seed lock "${tableName}" is already held.`, {
          cause: error,
        });
      }
      throw error;
    }
    acquired = true;
    return await fn();
  } finally {
    try {
      if (acquired) {
        const knex = await connection.client<Knex>();
        await knex(tableName).where({ id: 1, locked_by: owner }).delete();
      }
    } finally {
      inProcessSeedLocks.delete(lockKey);
    }
  }
}

async function ensureSeedLockTable(
  connection: MigrationConnection,
  tableName: string,
): Promise<void> {
  const knex = await connection.client<Knex>();
  if (await knex.schema.hasTable(tableName)) {
    return;
  }

  try {
    await knex.schema.createTable(
      tableName,
      (table: Knex.CreateTableBuilder) => {
        table.integer('id').primary();
        table.string('locked_by', 191).notNullable();
        table.dateTime('locked_at').notNullable();
      },
    );
  } catch (error) {
    if (!(await knex.schema.hasTable(tableName))) {
      throw error;
    }
  }
}
