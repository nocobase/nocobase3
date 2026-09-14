import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Knex } from 'knex';
import { afterEach, describe, expect, it } from 'vitest';
import sqlite from '../src/index.js';
import { createDatabaseManager } from '@nocobase/db';

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

// Inside the package so vitest transforms the TypeScript it writes and the
// migration's `@nocobase/db` import resolves; a system temp directory does neither.
function migrationDirectory(): string {
  const parent = path.resolve(import.meta.dirname, '.tmp');
  mkdirSync(parent, { recursive: true });
  const directory = mkdtempSync(path.join(parent, 'migrator-history-'));
  directories.push(directory);
  return directory;
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

describe('Migrator.history()', () => {
  it('reads applied migrations without creating the history table', async () => {
    const db = createDatabaseManager({
      drivers: { sqlite },
      connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
    });
    const directory = migrationDirectory();
    try {
      const migrator = db.createMigrator({ directory });
      await expect(migrator.history()).resolves.toEqual([]);
      const knex = await db.connection().client<Knex>();
      expect(await knex.schema.hasTable('__nocobase_migrations')).toBe(false);

      writeMigration(directory, '001_create_orders', 'orders');
      writeMigration(directory, '002_create_items', 'items');
      await migrator.latest();

      const history = await migrator.history();
      expect(history.map((record) => record.name)).toEqual([
        '001_create_orders',
        '002_create_items',
      ]);
      expect(history.at(-1)).toMatchObject({ batch: 1, packageName: 'app' });

      // The history and lock tables are bookkeeping, not Collections: listing
      // and scanning a migrated database must skip them rather than fail on
      // a table name that maps to no logical name.
      const listed = await db.collections().list();
      expect(listed.items.map((item) => item.name).sort()).toEqual([
        'items',
        'orders',
      ]);
      const scanned: string[] = [];
      for await (const collection of db.collections().scan()) {
        scanned.push(collection.name!);
      }
      expect(scanned.sort()).toEqual(['items', 'orders']);
    } finally {
      await db.destroy();
    }
  });

  it('honours a custom history table name', async () => {
    const db = createDatabaseManager({
      drivers: { sqlite },
      connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
    });
    const directory = migrationDirectory();
    try {
      writeMigration(directory, '001_create_orders', 'orders');
      const migrator = db.createMigrator({
        directory,
        tableName: 'custom_migrations',
      });
      await migrator.latest();
      await expect(db.createMigrator({ directory }).history()).resolves.toEqual(
        [],
      );
      await expect(migrator.history()).resolves.toMatchObject([
        { name: '001_create_orders' },
      ]);
    } finally {
      await db.destroy();
    }
  });

  it('skips custom-named history and lock tables that the connection declares as internal', async () => {
    const db = createDatabaseManager({
      drivers: { sqlite },
      connections: {
        main: {
          dialect: 'sqlite',
          filename: ':memory:',
          internalTables: ['legacy_history', 'legacy_lock'],
        },
      },
    });
    const directory = migrationDirectory();
    try {
      writeMigration(directory, '001_create_orders', 'orders');
      await db
        .createMigrator({
          directory,
          tableName: 'legacy_history',
          lockTableName: 'legacy_lock',
        })
        .latest();
      const listed = await db.collections().list();
      expect(listed.items.map((item) => item.name)).toEqual(['orders']);
      const scanned: string[] = [];
      for await (const collection of db.collections().scan()) {
        scanned.push(collection.name!);
      }
      expect(scanned).toEqual(['orders']);
    } finally {
      await db.destroy();
    }
  });
});
