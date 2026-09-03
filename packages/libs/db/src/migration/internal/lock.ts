import type { Knex } from 'knex';
import type { MigrationConnection } from '../types.js';

export const DEFAULT_MIGRATION_LOCK_TABLE = '__nocobase_migration_lock';

const inProcessLocks = new Set<string>();

export async function withMigrationLock<T>(
  connection: MigrationConnection,
  options: {
    tableName?: string;
  },
  fn: () => Promise<T>,
): Promise<T> {
  const tableName = options.tableName ?? DEFAULT_MIGRATION_LOCK_TABLE;
  const lockKey = `${connection.name}:${tableName}`;
  if (inProcessLocks.has(lockKey)) {
    throw new Error(
      `Migration lock "${tableName}" is already held for connection "${connection.name}".`,
    );
  }

  inProcessLocks.add(lockKey);
  const owner = createLockOwner();
  let acquired = false;

  try {
    await ensureMigrationLockTable(connection, tableName);
    await acquireDatabaseLock(connection, tableName, owner);
    acquired = true;
    return await fn();
  } finally {
    try {
      if (acquired) {
        await releaseDatabaseLock(connection, tableName, owner);
      }
    } finally {
      inProcessLocks.delete(lockKey);
    }
  }
}

export async function ensureMigrationLockTable(
  connection: MigrationConnection,
  tableName: string = DEFAULT_MIGRATION_LOCK_TABLE,
): Promise<void> {
  const knex = await connection.client<Knex>();
  const exists = await knex.schema.hasTable(tableName);
  if (exists) {
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
    if (await knex.schema.hasTable(tableName)) {
      return;
    }
    throw error;
  }
}

async function acquireDatabaseLock(
  connection: MigrationConnection,
  tableName: string,
  owner: string,
): Promise<void> {
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
      throw new Error(`Migration lock "${tableName}" is already held.`, {
        cause: error,
      });
    }
    throw error;
  }
}

async function releaseDatabaseLock(
  connection: MigrationConnection,
  tableName: string,
  owner: string,
): Promise<void> {
  const knex = await connection.client<Knex>();
  await knex(tableName)
    .where({
      id: 1,
      locked_by: owner,
    })
    .delete();
}

function createLockOwner(): string {
  return `${process.pid}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
}
