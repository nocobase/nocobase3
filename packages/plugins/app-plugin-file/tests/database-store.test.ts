/* eslint-disable @eslint-react/naming-convention-context-name -- Hono request contexts are not React contexts. */
import { createDatabaseManager, type DatabaseManager } from '@nocobase/db';
import { Hono, type Context } from 'hono';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createDatabaseFileStore } from '../server/database-file-store.js';
import type {
  DatabaseFileScopeResolver,
  NewFileRecord,
} from '../server/types.js';

const TEST_FILE_TABLE = 'testOrderFiles';

describe('database file store', () => {
  let database: DatabaseManager;

  beforeEach(async () => {
    database = createDatabaseManager({
      default: 'main',
      connections: {
        main: {
          dialect: 'sqlite',
          filename: ':memory:',
        },
      },
    });
    await database.builder().createCollection(TEST_FILE_TABLE, (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.integer('orderId').unsigned().notNull();
      collection.string('disk', { length: 64 }).notNull();
      collection.string('key', { length: 512 }).notNull();
      collection.string('filename', { length: 255 }).notNull();
      collection.string('mimeType', { length: 255 }).notNull();
      collection.bigInt('size').unsigned().notNull();
      collection.boolean('public').notNull().defaultTo(false);
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', { name: 'pk_test_order_files' });
      collection.unique(['disk', 'key'], {
        name: 'uq_test_order_files_disk_key',
      });
      collection.index('orderId', { name: 'idx_test_order_files_order' });
    });
  });

  afterEach(async () => {
    await database.destroy();
  });

  it('keeps list, find, create, and remove inside the resolved scope', async () => {
    const store = createDatabaseFileStore(database, {
      table: TEST_FILE_TABLE,
      scope: (context) => ({ orderId: Number(context.req.param('orderId')) }),
    });
    await insertFile(database, createFile('order-1-file'), 1);
    await insertFile(database, createFile('order-2-file'), 2);
    const orderOneRequest = await createContext(
      '/orders/:orderId',
      '/orders/1',
    );

    await expect(store.list(orderOneRequest)).resolves.toMatchObject([
      { id: 'order-1-file', size: 42 },
    ]);
    await expect(
      store.find('order-2-file', orderOneRequest),
    ).resolves.toBeNull();

    const created = await store.create(
      createFile('created-in-order-1'),
      orderOneRequest,
    );
    expect(created).toEqual(
      expect.objectContaining({
        id: 'created-in-order-1',
        filename: 'created-in-order-1.txt',
        size: 42,
      }),
    );
    expect(Object.keys(created).sort()).toEqual(
      [
        'createdAt',
        'disk',
        'filename',
        'id',
        'key',
        'mimeType',
        'public',
        'size',
        'updatedAt',
      ].sort(),
    );
    await expect(
      database
        .query()
        .selectFrom(TEST_FILE_TABLE)
        .select([
          'id',
          'orderId',
          'disk',
          'key',
          'filename',
          'mimeType',
          'size',
          'public',
        ])
        .where('id', '=', created.id)
        .executeTakeFirst(),
    ).resolves.toMatchObject({
      orderId: 1,
      disk: created.disk,
      key: created.key,
      filename: created.filename,
      mimeType: created.mimeType,
      size: 42,
      public: 0,
    });

    await expect(
      store.remove('order-2-file', orderOneRequest),
    ).resolves.toBeNull();
    await expect(
      database
        .query()
        .selectFrom(TEST_FILE_TABLE)
        .where('id', '=', 'order-2-file')
        .exists(),
    ).resolves.toBe(true);
    await expect(
      store.remove('order-1-file', orderOneRequest),
    ).resolves.toMatchObject({
      id: 'order-1-file',
    });
  });

  it('rejects unsafe identifiers and unsupported scope values before querying', async () => {
    expect(() =>
      createDatabaseFileStore(database, { table: 'files; drop table users' }),
    ).toThrow('Invalid database file table identifier');
    expect(() =>
      createDatabaseFileStore(database, {
        table: TEST_FILE_TABLE,
        order: { field: 'disk' as never },
      }),
    ).toThrow('Invalid database file order field');

    const request = await createContext('/files', '/files');
    const invalidScopes: readonly DatabaseFileScopeResolver[] = [
      () => ({ 'orderId = 1': 1 }),
      () => ({ orderId: Number.NaN }),
      () => ({ orderId: '' }),
      () => ({ orderId: {} as never }),
      () => ({ id: 'scope-must-not-replace-file-id' }),
      () => ({}),
    ];
    for (const scope of invalidScopes) {
      const store = createDatabaseFileStore(database, {
        table: TEST_FILE_TABLE,
        scope,
      });
      await expect(store.list(request)).rejects.toThrow(/scope/i);
    }
    const unscopedStore = createDatabaseFileStore(database, {
      table: TEST_FILE_TABLE,
    });
    await expect(unscopedStore.find('', request)).rejects.toThrow(
      'file id must not be empty',
    );
  });

  it('converts database sizes only when they are safe API integers', async () => {
    const orderRequest = await createContext('/orders/:orderId', '/orders/1');
    const store = createDatabaseFileStore(database, {
      table: TEST_FILE_TABLE,
      scope: () => ({ orderId: 1 }),
    });
    await insertFile(database, createFile('safe-size'), 1);
    await expect(store.find('safe-size', orderRequest)).resolves.toMatchObject({
      size: 42,
    });

    await insertFile(
      database,
      { ...createFile('unsafe-size'), size: Number.MAX_SAFE_INTEGER + 1 },
      1,
    );
    await expect(store.find('unsafe-size', orderRequest)).rejects.toThrow(
      'safe API number range',
    );
  });
});

async function createContext(route: string, path: string): Promise<Context> {
  let captured: Context | undefined;
  const app = new Hono();
  app.get(route, (context) => {
    captured = context;
    return context.body(null, 204);
  });
  await app.request(path);
  if (!captured) {
    throw new Error(`Test route "${route}" did not match "${path}".`);
  }
  return captured;
}

async function insertFile(
  database: DatabaseManager,
  file: NewFileRecord,
  orderId: number,
): Promise<void> {
  const now = new Date();
  await database
    .query()
    .insertInto(TEST_FILE_TABLE)
    .values({ ...file, orderId, createdAt: now, updatedAt: now })
    .execute();
}

function createFile(id: string): NewFileRecord {
  return {
    id,
    disk: 'local',
    key: `tests/${id}`,
    filename: `${id}.txt`,
    mimeType: 'text/plain',
    size: 42,
    public: false,
  };
}
