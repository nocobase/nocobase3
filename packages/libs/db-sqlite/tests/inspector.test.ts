import { describe, expect, it } from 'vitest';
import knex from 'knex';
import sqlite from '../src/index.js';
import { SqliteSchemaInspector } from '../src/inspectors/sqlite.js';
import { sqliteTypes } from '../src/inspectors/sqlite.js';
import { normalizePhysicalDataType } from '@nocobase/db';

describe('sqlite schema inspector', () => {
  it('is wired into the public driver descriptor', () => {
    expect(
      sqlite.driver.createSchemaInspector?.({
        connectionName: 'main',
        config: {},
        resolveClient: async () => ({}) as never,
      } as never),
    ).toBeInstanceOf(SqliteSchemaInspector);
  });

  it('reports the single SQLite schema', async () => {
    const inspector = new SqliteSchemaInspector({
      connectionName: 'main',
      resolveClient: async () => ({}) as never,
    });

    await expect(inspector.listSchemas()).resolves.toEqual([
      { name: 'main', default: true },
    ]);
  });

  it('reads a real SQLite table through the dialect inspector', async () => {
    const client = knex({
      client: 'better-sqlite3',
      connection: { filename: ':memory:' },
      useNullAsDefault: true,
    });
    try {
      await client.schema.createTable('items', (table) => {
        table.increments('id');
        table.string('name').notNullable();
        table.unique(['name']);
      });
      const inspector = new SqliteSchemaInspector({
        connectionName: 'main',
        resolveClient: async () => client,
      });

      const collection = await inspector.getPhysicalCollection({
        tableName: 'items',
      });
      expect(collection).toMatchObject({
        schema: 'main',
        tableName: 'items',
        kind: 'table',
        primaryKey: { columns: ['id'] },
      });
      expect(collection?.columns.map((column) => column.columnName)).toEqual([
        'id',
        'name',
      ]);
      expect(collection?.uniqueConstraints).toEqual([]);
      expect(collection?.indexes).toEqual([
        {
          name: 'items_name_unique',
          keys: [{ columnName: 'name', order: 'asc' }],
          unique: true,
        },
      ]);
    } finally {
      await client.destroy();
    }
  });

  it('rejects schemas other than main before querying the database', async () => {
    const inspector = new SqliteSchemaInspector({
      connectionName: 'main',
      resolveClient: async () => {
        throw new Error('database should not be queried');
      },
    });

    await expect(
      inspector.getPhysicalCollection({ schema: 'temp', tableName: 'items' }),
    ).rejects.toMatchObject({
      code: 'SCHEMA_INSPECTION_INVALID_OPTIONS',
      schema: 'temp',
    });
  });

  it('normalizes SQLite-specific physical types', () => {
    expect(normalizePhysicalDataType(sqliteTypes, 'TIMESTAMP(3)')).toBe(
      'datetime',
    );
    expect(normalizePhysicalDataType(sqliteTypes, 'FLOAT')).toBe('float');
  });
});
