import type { Knex } from 'knex';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createDatabaseManager,
  createMigrationContext,
  type DatabaseManager,
} from '@nocobase/app-database';

import filesMigration from '../database/migrations/202608221000_files_create_files.js';

let database: DatabaseManager | undefined;

afterEach(async () => {
  await database?.destroy();
  database = undefined;
});

describe('files migration', () => {
  it('creates and drops the files schema with required constraints and indexes', async () => {
    const { manager, knex } = await createTestDatabase();
    database = manager;
    const context = createMigrationContext(manager.connection());
    await filesMigration.up(context);

    expect(await knex.schema.hasTable('files')).toBe(true);
    const columns = await knex.raw('PRAGMA table_info(files)');
    expect(columns.map((column: { name: string }) => column.name)).toEqual(
      expect.arrayContaining([
        'id',
        'status',
        'storage_key',
        'name',
        'size',
        'content_type',
        'upload_expires_at',
        'public_token_hash',
        'public_disposition',
        'created_at',
        'updated_at',
      ]),
    );
    expect(
      columns.find((column: { name: string }) => column.name === 'id'),
    ).toMatchObject({
      type: 'varchar(64)',
      notnull: 1,
      pk: 1,
    });
    expect(
      columns.find((column: { name: string }) => column.name === 'size'),
    ).toMatchObject({ type: 'bigint', notnull: 0 });

    const indexes = await knex.raw('PRAGMA index_list(files)');
    const indexedColumns = await Promise.all(
      indexes.map(async (index: { name: string; unique: number }) => ({
        unique: index.unique,
        columns: (await knex.raw(`PRAGMA index_info(${index.name})`)).map(
          (column: { name: string }) => column.name,
        ),
      })),
    );
    expect(indexedColumns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          unique: 0,
          columns: ['status', 'upload_expires_at'],
        }),
      ]),
    );

    const now = new Date('2026-08-24T00:00:00.000Z');
    const base = {
      status: 'ready',
      name: 'report.txt',
      size: 10,
      content_type: 'text/plain',
      upload_expires_at: now,
      public_token_hash: null,
      public_disposition: null,
      created_at: now,
      updated_at: now,
    };
    await knex('files').insert({
      ...base,
      id: 'file-1',
      storage_key: 'ready/file-1/object',
    });
    await expect(
      knex('files').insert({
        ...base,
        id: 'file-2',
        storage_key: 'ready/file-1/object',
      }),
    ).rejects.toThrow(/unique/i);

    await filesMigration.down(context);
    expect(await knex.schema.hasTable('files')).toBe(false);
  });
});

async function createTestDatabase(): Promise<{
  manager: DatabaseManager;
  knex: Knex;
}> {
  const manager = createDatabaseManager({
    default: 'sqlite',
    connections: {
      sqlite: {
        dialect: 'sqlite',
        driver: 'better-sqlite3',
        filename: ':memory:',
      },
    },
  });
  const connection = manager.connection();
  const knex = await connection.client<Knex>();
  await knex.raw('PRAGMA foreign_keys = ON');
  return { manager, knex };
}
