import { describe, expect, it } from 'vitest';
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
