import { createDatabaseManager, type DatabaseManager } from '@nocobase/db';
import sqlite from '@nocobase/db-sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  listCollections,
  listConnections,
  readCollection,
  readPhysicalCollection,
  type ExplorerDatabaseConfig,
} from '../server/explorer.js';

const config: ExplorerDatabaseConfig = {
  default: 'main',
  connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
};

/**
 * What "read-only" is actually worth here.
 *
 * The Explorer issues no write of its own, but reading a Collection
 * initializes the Collection registry, and on a managed connection the
 * registry's metadata store creates its own `__nocobase_collection_metadata`
 * table when it is missing. So the honest guarantee is narrower than "touches
 * nothing": no Collection is created, altered or dropped, no row of any table
 * changes, and the single table the Explorer can bring into existence is that
 * bookkeeping one.
 *
 * These tests state that boundary rather than hiding it behind a warm-up read,
 * so a change that widens it fails here instead of on someone's database.
 */
describe('reading never changes a database', () => {
  let database: DatabaseManager;

  beforeEach(async () => {
    database = createDatabaseManager({ drivers: { sqlite }, ...config });
    await database
      .connection()
      .builder.createCollection('customers', (collection) => {
        collection.increments('id').primary();
        collection.string('name').notNull();
      });
    await database
      .connection()
      .repository('customers')
      .createOne({ values: { name: 'Ada' } });
  });

  afterEach(async () => {
    await database.destroy();
  });

  it('adds nothing but its own bookkeeping table on a first read', async () => {
    // A database NocoBase has never touched: the table is created with raw
    // SQL, so the Collection builder never runs and the metadata store is
    // genuinely absent. This is the one moment the Explorer can change a
    // schema, and it is not reachable once migrations have run.
    const virgin = createDatabaseManager({ drivers: { sqlite }, ...config });
    try {
      await raw(
        virgin,
        'create table invoices (id integer primary key, total integer not null)',
      );
      const before = await tableNames(virgin);
      expect(before).toEqual(['invoices']);

      await listCollections(virgin, config, 'main');

      const added = (await tableNames(virgin)).filter(
        (name) => !before.includes(name),
      );
      expect(added).toEqual(['__nocobase_collection_metadata']);
      // The foreign table itself is untouched.
      expect(await raw(virgin, 'select * from invoices')).toEqual([]);
    } finally {
      await virgin.destroy();
    }
  });

  it('leaves the schema byte-identical once that table exists', async () => {
    await listCollections(database, config, 'main');
    const before = await schemaSnapshot(database);

    listConnections(config);
    await listCollections(database, config, 'main');
    await readCollection(database, config, 'main', 'customers');
    await readPhysicalCollection(database, config, 'main', 'customers');

    expect(await schemaSnapshot(database)).toEqual(before);
  });

  it('leaves the rows of every table untouched, bookkeeping included', async () => {
    // Every table, not just the fixture's: a regression that wrote a metadata
    // row on read would pass a check that only looked at `customers`.
    await listCollections(database, config, 'main');
    const before = await allRows(database);
    expect(Object.keys(before)).toContain('__nocobase_collection_metadata');
    expect(before.customers).toHaveLength(1);

    await listCollections(database, config, 'main');
    await readCollection(database, config, 'main', 'customers');
    await readPhysicalCollection(database, config, 'main', 'customers');

    expect(await allRows(database)).toEqual(before);
  });
});

async function raw<T>(database: DatabaseManager, sql: string): Promise<T[]> {
  const client = await database
    .connection()
    .client<{ raw: (sql: string) => Promise<unknown> }>();
  return (await client.raw(sql)) as T[];
}

async function tableNames(database: DatabaseManager): Promise<string[]> {
  const rows = await raw<{ name: string }>(
    database,
    "select name from sqlite_master where type = 'table' order by name",
  );
  return rows.map((row) => row.name);
}

async function schemaSnapshot(
  database: DatabaseManager,
): Promise<readonly { name: string; sql: string | null }[]> {
  return raw(database, 'select name, sql from sqlite_master order by name');
}

async function allRows(
  database: DatabaseManager,
): Promise<Record<string, unknown[]>> {
  const snapshot: Record<string, unknown[]> = {};
  for (const name of await tableNames(database)) {
    if (name.startsWith('sqlite_')) continue;
    snapshot[name] = await raw(database, `select * from "${name}"`);
  }
  return snapshot;
}
