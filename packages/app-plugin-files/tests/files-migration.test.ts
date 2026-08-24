import type { Knex } from 'knex';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createDatabaseManager,
  createMigrator,
  type DatabaseManager,
} from '@nocobase/database';

import filesMigration from '../database/migrations/202608221000_files_create_files.js';

let database: DatabaseManager | undefined;

afterEach(async () => {
  await database?.destroy();
  database = undefined;
});

describe('files migration', () => {
  it('creates and drops the files schema with named constraints and indexes', async () => {
    const { manager, knex } = await createTestDatabase();
    database = manager;
    const migrator = createMigrator({
      database: manager,
      directory: fileURLToPath(
        new URL('../database/migrations', import.meta.url),
      ),
      packageName: '@nocobase/app-plugin-files',
      tableName: 'files_migrations',
      lockTableName: 'files_migration_lock',
    });

    expect(filesMigration.name).toBe('202608221000_files_create_files');
    await expect(migrator.latest()).resolves.toMatchObject({
      executed: ['202608221000_files_create_files'],
      skipped: [],
    });

    expect(await knex.schema.hasTable('files')).toBe(true);
    const tableDefinition = await knex('sqlite_master')
      .select('sql')
      .where({ type: 'table', name: 'files' })
      .first<{ sql: string }>();
    expect(tableDefinition?.sql).toMatch(/pk_files/i);
    const columns = await knex.raw('PRAGMA table_info(files)');
    expect(columns.map((column: { name: string }) => column.name)).toEqual([
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
    ]);
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
    expect(indexes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'uq_files_storage_key',
          unique: 1,
        }),
        expect.objectContaining({
          name: 'idx_files_status_upload_expires_at',
          unique: 0,
        }),
      ]),
    );
    const statusExpiryColumns = await knex.raw(
      'PRAGMA index_info(idx_files_status_upload_expires_at)',
    );
    expect(statusExpiryColumns).toEqual([
      expect.objectContaining({ name: 'status', seqno: 0 }),
      expect.objectContaining({ name: 'upload_expires_at', seqno: 1 }),
    ]);

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

    await expect(migrator.rollback()).resolves.toMatchObject({
      rolledBack: ['202608221000_files_create_files'],
    });
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
