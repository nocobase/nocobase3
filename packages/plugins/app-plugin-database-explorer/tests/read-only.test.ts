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
 * The Explorer promises to change nothing. That promise is not only about the
 * statements written here: reading a Collection initializes the Collection
 * registry, whose metadata store creates its own bookkeeping table when it is
 * absent. This pins the boundary, so a change further down that moves schema
 * work into a read path fails here rather than on someone's database.
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
    // Read once first, so any bookkeeping the registry needs already exists
    // and the comparison below is about the Explorer, not about setup.
    await listCollections(database, config, 'main');
  });

  afterEach(async () => {
    await database.destroy();
  });

  it('leaves the physical schema byte-identical', async () => {
    const before = await schemaSnapshot(database);

    listConnections(config);
    await listCollections(database, config, 'main');
    await readCollection(database, config, 'main', 'customers');
    await readPhysicalCollection(database, config, 'main', 'customers');

    expect(await schemaSnapshot(database)).toEqual(before);
  });

  it('leaves the rows of every table untouched', async () => {
    const repository = database.connection().repository('customers');
    await repository.createOne({ values: { name: 'Ada' } });
    const before = await repository.findMany();

    await listCollections(database, config, 'main');
    await readCollection(database, config, 'main', 'customers');
    await readPhysicalCollection(database, config, 'main', 'customers');

    expect(await repository.findMany()).toEqual(before);
  });
});

async function schemaSnapshot(
  database: DatabaseManager,
): Promise<readonly { name: string; sql: string | null }[]> {
  const client = await database.connection().client<{
    raw: (sql: string) => Promise<unknown>;
  }>();
  const rows = (await client.raw(
    'select name, sql from sqlite_master order by name',
  )) as readonly { name: string; sql: string | null }[];
  return [...rows];
}
