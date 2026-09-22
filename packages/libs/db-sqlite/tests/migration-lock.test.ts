import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Knex } from 'knex';
import { afterEach, describe, expect, it } from 'vitest';
import sqlite from '../src/index.js';
import { createDatabaseManager, type DatabaseManager } from '@nocobase/db';

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

async function holdLock(
  knex: Knex,
  values: { locked_by: string; locked_at: Date },
): Promise<void> {
  await knex.schema.createTable('__nocobase_migration_lock', (table) => {
    table.integer('id').primary();
    table.string('locked_by', 191).notNullable();
    table.dateTime('locked_at').notNullable();
  });
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
    });

    writeMigration(directory, '001_create_orders', 'orders');
    const migrator = db.createMigrator({
      directory,
      lockAcquireTimeoutMs: 0,
    });

    await expect(migrator.latest()).rejects.toThrow(
      /Migration lock "__nocobase_migration_lock" is already held by "4242:1789967254830:abcdef" since 2026-09-21T05:07:34\.847Z\..*delete the row with id 1/s,
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
