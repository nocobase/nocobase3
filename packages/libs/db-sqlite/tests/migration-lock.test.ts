import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Knex } from 'knex';
import { afterEach, describe, expect, it } from 'vitest';
import sqlite from '../src/index.js';
import {
  createDatabaseManager,
  TASK_LOCK_EXPIRY_MS,
  TASK_LOCK_HEARTBEAT_INTERVAL_MS,
  type DatabaseManager,
  type StaleTaskLockTakeover,
} from '@nocobase/db';

const directories: string[] = [];
const managers: DatabaseManager[] = [];

afterEach(async () => {
  for (const manager of managers.splice(0)) {
    await manager.destroy();
  }
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

// Inside the package so vitest transforms the TypeScript it writes and the
// migration's `@nocobase/db` import resolves; a system temp directory does
// neither.
function workspace(): string {
  const parent = path.resolve(import.meta.dirname, '.tmp');
  mkdirSync(parent, { recursive: true });
  const directory = mkdtempSync(path.join(parent, 'migration-lock-'));
  directories.push(directory);
  return directory;
}

/** A file database, so the lock row is shared by every pooled connection. */
function database(directory: string): DatabaseManager {
  const manager = createDatabaseManager({
    drivers: { sqlite },
    connections: {
      main: {
        dialect: 'sqlite',
        filename: path.join(directory, 'database.sqlite'),
      },
    },
  });
  managers.push(manager);
  return manager;
}

function writeMigration(directory: string, name: string, table: string): void {
  writeFileSync(
    path.join(directory, `${name}.ts`),
    `import { defineMigration } from '@nocobase/db';
export default defineMigration({
  name: '${name}',
  async up({ builder }) {
    await builder.createCollection('${table}', (collection) => {
      collection.increments('id');
    });
  },
  async down({ builder }) {
    await builder.dropCollection('${table}');
  },
});
`,
  );
}

/**
 * Writes a lock row the way a run would. The table is created without
 * `heartbeat_at` unless the row carries one, because that is the shape an
 * application upgrading from an earlier version already has on disk.
 */
async function holdLock(
  knex: Knex,
  values: { locked_by: string; locked_at: Date; heartbeat_at?: Date },
): Promise<void> {
  await knex.schema.createTable('__nocobase_migration_lock', (table) => {
    table.integer('id').primary();
    table.string('locked_by', 191).notNullable();
    table.dateTime('locked_at').notNullable();
  });
  if (values.heartbeat_at) {
    await knex.schema.alterTable('__nocobase_migration_lock', (table) => {
      table.dateTime('heartbeat_at').nullable();
    });
  }
  await knex('__nocobase_migration_lock').insert({ id: 1, ...values });
}

describe('migration lock contention', () => {
  it('names the holder and how to clear it instead of reporting the insert', async () => {
    const directory = workspace();
    const db = database(directory);
    const knex = await db.connection().client<Knex>();
    await holdLock(knex, {
      locked_by: '4242:1789967254830:abcdef',
      locked_at: new Date('2026-09-21T05:07:34.847Z'),
      // Beating now, so the holder is alive however long it has been working.
      heartbeat_at: new Date(),
    });

    writeMigration(directory, '001_create_orders', 'orders');
    const migrator = db.createMigrator({
      directory,
      lockAcquireTimeoutMs: 0,
    });

    await expect(migrator.latest()).rejects.toThrow(
      /Migration lock "__nocobase_migration_lock" is already held by "4242:1789967254830:abcdef" since 2026-09-21T05:07:34\.847Z\..*nocobase db unlock/s,
    );
    // The driver's constraint text is the cause, never the reported message.
    await expect(migrator.latest()).rejects.not.toThrow(/UNIQUE constraint/);
  });

  it('waits for a transient holder rather than failing on the first conflict', async () => {
    const directory = workspace();
    const db = database(directory);
    const knex = await db.connection().client<Knex>();
    await holdLock(knex, {
      locked_by: 'departing-process',
      locked_at: new Date(),
      heartbeat_at: new Date(),
    });

    writeMigration(directory, '001_create_orders', 'orders');
    const migrator = db.createMigrator({
      directory,
      lockAcquireTimeoutMs: 10_000,
    });

    const released = new Promise<void>((resolve) => {
      setTimeout(() => {
        void knex('__nocobase_migration_lock')
          .where({ id: 1 })
          .delete()
          .then(() => resolve());
      }, 150);
    });

    const [result] = await Promise.all([migrator.latest(), released]);
    expect(result.executed).toEqual(['001_create_orders']);
    expect(await knex('__nocobase_migration_lock').select('id')).toEqual([]);
  });

  it('reports a failing insert that has no lock row to wait for', async () => {
    const directory = workspace();
    const db = database(directory);
    const knex = await db.connection().client<Knex>();
    // A lock table the acquiring insert cannot satisfy, left empty: retrying
    // until the timeout would hide a real fault behind a contention message.
    await knex.schema.createTable('__nocobase_migration_lock', (table) => {
      table.integer('id').primary();
      table.string('locked_by', 191).notNullable();
      table.dateTime('locked_at').notNullable();
      table.string('required_by_schema').notNullable();
    });

    writeMigration(directory, '001_create_orders', 'orders');
    const migrator = db.createMigrator({ directory });

    await expect(migrator.latest()).rejects.toThrow(
      'Migration lock "__nocobase_migration_lock" could not be acquired, and the lock table holds no row to wait for.',
    );
  });
});

describe('recovering a lock a killed run left behind', () => {
  it('takes over a lock that stopped beating and reports it', async () => {
    const directory = workspace();
    const db = database(directory);
    const knex = await db.connection().client<Knex>();
    const abandoned = new Date(Date.now() - TASK_LOCK_EXPIRY_MS * 4);
    await holdLock(knex, {
      locked_by: 'killed-process',
      locked_at: abandoned,
      heartbeat_at: abandoned,
    });

    writeMigration(directory, '001_create_orders', 'orders');
    const takeovers: StaleTaskLockTakeover[] = [];
    const migrator = db.createMigrator({
      directory,
      lockAcquireTimeoutMs: 1000,
      onStaleLock: (takeover) => takeovers.push(takeover),
    });

    // A hard kill runs no cleanup, so waiting for the row to be released would
    // wait forever. It expires instead, and the next run continues.
    const result = await migrator.latest();
    expect(result.executed).toEqual(['001_create_orders']);
    expect(takeovers).toEqual([
      expect.objectContaining({
        tableName: '__nocobase_migration_lock',
        lockedBy: 'killed-process',
      }),
    ]);
    expect(await knex('__nocobase_migration_lock').select('id')).toEqual([]);
  });

  it('adds the heartbeat column to a lock table that predates it', async () => {
    const directory = workspace();
    const db = database(directory);
    const knex = await db.connection().client<Knex>();
    await holdLock(knex, { locked_by: 'old-run', locked_at: new Date(0) });
    expect(
      await knex.schema.hasColumn('__nocobase_migration_lock', 'heartbeat_at'),
    ).toBe(false);

    writeMigration(directory, '001_create_orders', 'orders');
    // The lock is what every migration runs inside, so its own table cannot be
    // upgraded by a migration.
    await db.createMigrator({ directory }).latest();

    expect(
      await knex.schema.hasColumn('__nocobase_migration_lock', 'heartbeat_at'),
    ).toBe(true);
  });

  it('reports, refuses and releases through lock() and unlock()', async () => {
    const directory = workspace();
    const db = database(directory);
    const knex = await db.connection().client<Knex>();
    const migrator = db.createMigrator({ directory });

    await expect(migrator.lock()).resolves.toBeUndefined();
    await expect(migrator.unlock()).resolves.toMatchObject({
      released: false,
      reason: 'not-held',
    });

    const lockedAt = new Date();
    await holdLock(knex, {
      locked_by: 'live-run',
      locked_at: lockedAt,
      heartbeat_at: lockedAt,
    });
    await expect(migrator.lock()).resolves.toMatchObject({
      lockedBy: 'live-run',
      expired: false,
    });
    // Releasing a live holder's lock lets a second run start beside it.
    await expect(migrator.unlock()).resolves.toMatchObject({
      released: false,
      reason: 'active',
    });
    await expect(migrator.unlock({ force: true })).resolves.toMatchObject({
      released: true,
    });
    await expect(migrator.lock()).resolves.toBeUndefined();

    const stale = new Date(Date.now() - TASK_LOCK_EXPIRY_MS * 4);
    await knex('__nocobase_migration_lock').insert({
      id: 1,
      locked_by: 'killed-run',
      locked_at: stale,
      heartbeat_at: stale,
    });
    await expect(migrator.unlock()).resolves.toMatchObject({
      released: true,
      lock: expect.objectContaining({ lockedBy: 'killed-run', expired: true }),
    });
  });

  it('beats often enough that a working run is never taken over', () => {
    // Several missed beats are tolerated, so a slow database does not hand the
    // lock to a second run while the first is still working.
    expect(TASK_LOCK_HEARTBEAT_INTERVAL_MS * 3).toBeLessThanOrEqual(
      TASK_LOCK_EXPIRY_MS,
    );
  });
});
