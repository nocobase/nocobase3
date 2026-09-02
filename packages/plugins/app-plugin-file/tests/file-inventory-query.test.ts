import { createDatabaseManager, type DatabaseManager } from '@nocobase/db';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  listDatabaseFileSourceItems,
  summarizeDatabaseFileSource,
} from '../server/file-inventory-query.js';
import { serializeDatabaseDate } from '../server/database-file-record.js';
import type { RegisteredDatabaseFileSource } from '../server/file-source-registry.js';

const TABLE = 'inventoryFiles';

describe('file inventory query', () => {
  let database: DatabaseManager;

  beforeEach(async () => {
    database = createDatabaseManager({
      default: 'main',
      connections: {
        main: { dialect: 'sqlite', filename: ':memory:' },
      },
    });
    await database.builder().createCollection(TABLE, (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('disk', { length: 64 }).notNull();
      collection.string('key', { length: 512 }).notNull();
      collection.string('filename', { length: 255 }).notNull();
      collection.string('mimeType', { length: 255 }).notNull();
      collection.bigInt('size').unsigned().notNull();
      collection.boolean('public').notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.string('businessField', { length: 64 });
      collection.primary('id', { name: 'pk_inventory_files' });
    });
    for (let index = 1; index <= 3; index += 1) {
      const date = new Date(`2026-09-0${index}T00:00:00.000Z`);
      await database
        .query()
        .insertInto(TABLE)
        .values({
          id: `file-${index}`,
          disk: 'local',
          key: `files/file-${index}`,
          filename: `file-${index}.txt`,
          mimeType: 'text/plain',
          size: index * 10,
          public: index === 3,
          createdAt: date,
          updatedAt: date,
          businessField: 'ignored',
        })
        .execute();
    }
  });

  afterEach(async () => {
    await database.destroy();
  });

  it('counts and paginates only the standard client-safe fields', async () => {
    await expect(
      summarizeDatabaseFileSource(database, source()),
    ).resolves.toMatchObject({ count: 3, status: 'available' });
    const result = await listDatabaseFileSourceItems(database, source(), {
      page: 2,
      pageSize: 2,
    });

    expect(result.meta).toEqual({
      page: 2,
      pageSize: 2,
      total: 3,
      totalPages: 2,
    });
    expect(result.data).toEqual([
      expect.objectContaining({
        id: 'file-1',
        size: 10,
        public: false,
        createdAt: '2026-09-01T00:00:00.000Z',
      }),
    ]);
    expect(result.data[0]).not.toHaveProperty('key');
    expect(result.data[0]).not.toHaveProperty('businessField');
  });

  it('marks one missing source unavailable without throwing', async () => {
    const error = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const summary = await summarizeDatabaseFileSource(database, {
      ...source(),
      id: 'missingFiles',
      table: 'missingFiles',
    });
    expect(summary).toMatchObject({
      count: null,
      status: 'unavailable',
    });
    expect(summary).not.toHaveProperty('error');
    expect(error).toHaveBeenCalledWith(
      'File inventory source summary failed.',
      expect.objectContaining({ table: 'missingFiles' }),
    );
    error.mockRestore();
  });

  it('preserves database date strings without timezone reinterpretation', () => {
    expect(serializeDatabaseDate('2026-09-02 10:00:00')).toBe(
      '2026-09-02 10:00:00',
    );
  });
});

function source(): RegisteredDatabaseFileSource {
  return {
    id: TABLE,
    table: TABLE,
  };
}
