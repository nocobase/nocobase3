import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Knex } from 'knex';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createDatabaseManager,
  InMemoryCollectionMetadataStore,
  type DatabaseManager,
} from '@nocobase/db';
import sqlite from '../src/index.js';

const require = createRequire(import.meta.url);

interface NativeDatabase {
  exec(sql: string): void;
  close(): void;
}
const BetterSqlite3 = require('better-sqlite3') as new (
  filename: string,
) => NativeDatabase;

function createManager(filename: string): DatabaseManager {
  return createDatabaseManager({
    drivers: { sqlite },
    metadataStore: new InMemoryCollectionMetadataStore(),
    connections: { main: { dialect: 'sqlite', filename } },
  });
}

async function count(database: DatabaseManager, table: string) {
  const client = await database.connection().client<Knex>();
  const [row] = (await client(table).count({ count: '*' })) as {
    count: number;
  }[];
  return Number(row?.count);
}

// SQLite keeps a transaction open when COMMIT fails, so that the caller can
// retry it; Knex never retries, so the connection has to be rolled back.
describe('SQLite transaction whose COMMIT fails', () => {
  const cleanups: (() => Promise<void> | void)[] = [];
  afterEach(async () => {
    for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  });

  it('rolls back a deferred foreign key violation and keeps the connection usable', async () => {
    const database = createManager(':memory:');
    cleanups.push(() => database.destroy());
    const client = await database.connection().client<Knex>();
    await client.raw('pragma foreign_keys = on');
    await client.raw('create table parents (id integer primary key)');
    await client.raw(
      'create table children (id integer primary key, parent_id integer references parents (id) deferrable initially deferred)',
    );

    await expect(
      database.transaction(async (connection) => {
        await (
          await connection.client<Knex>()
        ).raw('insert into children (id, parent_id) values (1, 404)');
      }),
    ).rejects.toThrow('FOREIGN KEY constraint failed');

    expect(await count(database, 'children')).toBe(0);
    await database.transaction(async (connection) => {
      const trx = await connection.client<Knex>();
      await trx.raw('insert into parents (id) values (404)');
      await trx.raw('insert into children (id, parent_id) values (1, 404)');
    });
    expect(await count(database, 'children')).toBe(1);
  });

  it('rolls back a COMMIT that fails with SQLITE_BUSY', async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'nb-sqlite-busy-'));
    cleanups.push(() => rmSync(directory, { recursive: true, force: true }));
    const filename = path.join(directory, 'busy.sqlite');
    const database = createManager(filename);
    cleanups.push(() => database.destroy());
    const client = await database.connection().client<Knex>();
    await client.raw('pragma busy_timeout = 0');
    await client.raw('create table items (id integer primary key)');

    // Another process holding a read transaction keeps the writer from
    // taking the exclusive lock its COMMIT needs.
    const reader = new BetterSqlite3(filename);
    cleanups.push(() => reader.close());
    reader.exec('begin; select count(*) from items;');

    await expect(
      database.transaction(async (connection) => {
        await (await connection.client<Knex>())('items').insert({ id: 1 });
      }),
    ).rejects.toMatchObject({ code: 'SQLITE_BUSY' });

    reader.exec('commit');
    expect(await count(database, 'items')).toBe(0);
    await database.transaction(async (connection) => {
      await (await connection.client<Knex>())('items').insert({ id: 2 });
    });
    expect(await count(database, 'items')).toBe(1);
  });
});
