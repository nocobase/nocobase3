/* eslint-disable @eslint-react/naming-convention-context-name -- Hono request contexts are not React contexts. */
import {
  createDatabaseManager,
  type DatabaseConnection,
  type DatabaseManager,
} from '@nocobase/app-database';
import { Hono, type Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { vi } from 'vitest';

import migration from '../database/migrations/202608270001_create_files_demo_tables.js';
import { createDatabaseFileStore } from '../server/database-file-store.js';
import { FILES_DEMO_COLLECTIONS } from '../server/demo/constants.js';
import {
  createOrderAttachmentStore,
  createProfileAvatarStore,
} from '../server/demo/stores.js';
import type {
  DatabaseFileScopeResolver,
  NewFileRecord,
} from '../server/types.js';

interface RawDatabaseClient {
  raw(sql: string): Promise<unknown>;
}

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
    const connection = database.connection();
    const client = await connection.client<RawDatabaseClient>();
    await client.raw('PRAGMA foreign_keys = ON');
    await migration.up({
      builder: connection.builder,
      query: connection.query,
      connection,
    });
    await insertDemoParents(database);
  });

  afterEach(async () => {
    await database.destroy();
  });

  it('keeps list, find, create, and remove inside the resolved scope', async () => {
    const store = createDatabaseFileStore(database, {
      table: FILES_DEMO_COLLECTIONS.orderAttachments,
      scope: (context) => ({ orderId: Number(context.req.param('orderId')) }),
    });
    await insertAttachment(database, createFile('order-1-file'), 1);
    await insertAttachment(database, createFile('order-2-file'), 2);
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
        .selectFrom(FILES_DEMO_COLLECTIONS.orderAttachments)
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
        .selectFrom(FILES_DEMO_COLLECTIONS.orderAttachments)
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
        table: FILES_DEMO_COLLECTIONS.orderAttachments,
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
        table: FILES_DEMO_COLLECTIONS.orderAttachments,
        scope,
      });
      await expect(store.list(request)).rejects.toThrow(/scope/i);
    }
    const unscopedStore = createDatabaseFileStore(database, {
      table: FILES_DEMO_COLLECTIONS.orderAttachments,
    });
    await expect(unscopedStore.find('', request)).rejects.toThrow(
      'file id must not be empty',
    );
  });

  it('converts database sizes only when they are safe API integers', async () => {
    const orderRequest = await createContext('/orders/:orderId', '/orders/1');
    const store = createDatabaseFileStore(database, {
      table: FILES_DEMO_COLLECTIONS.orderAttachments,
      scope: () => ({ orderId: 1 }),
    });
    await insertAttachment(database, createFile('safe-size'), 1);
    await expect(store.find('safe-size', orderRequest)).resolves.toMatchObject({
      size: 42,
    });

    await insertAttachment(
      database,
      { ...createFile('unsafe-size'), size: Number.MAX_SAFE_INTEGER + 1 },
      1,
    );
    await expect(store.find('unsafe-size', orderRequest)).rejects.toThrow(
      'safe API number range',
    );
  });

  it('turns invalid Demo path parameters into client errors without an unscoped fallback', async () => {
    await insertAttachment(database, createFile('protected-file'), 1);
    const orderStore = createOrderAttachmentStore(database);
    const profileStore = createProfileAvatarStore(database);
    const invalidOrderRequest = await createContext(
      '/orders/:orderId',
      '/orders/not-a-number',
    );
    const invalidProfileRequest = await createContext('/profiles', '/profiles');

    await expect(orderStore.list(invalidOrderRequest)).rejects.toMatchObject({
      status: 400,
    });
    await expect(
      profileStore.list(invalidProfileRequest),
    ).rejects.toBeInstanceOf(HTTPException);
    await expect(
      database
        .query()
        .selectFrom(FILES_DEMO_COLLECTIONS.orderAttachments)
        .where('id', '=', 'protected-file')
        .exists(),
    ).resolves.toBe(true);
  });

  it('uses transaction-scoped PostgreSQL locks for limited creates', async () => {
    const raw = vi.fn().mockResolvedValue([]);
    const connection = database.connection();
    const postgresConnection = {
      ...connection,
      dialect: 'postgres',
      client: async () => ({ raw }),
    } as DatabaseConnection;
    const transaction = vi
      .spyOn(database, 'transaction')
      .mockImplementation(async (callback) => callback(postgresConnection));
    const store = createDatabaseFileStore(database, {
      table: FILES_DEMO_COLLECTIONS.orderAttachments,
      scope: () => ({ orderId: 1 }),
    });
    const request = await createContext('/orders/:orderId', '/orders/1');

    await store.createWithLimit?.(createFile('postgres-limited'), 10, request);

    expect(raw).toHaveBeenCalledWith('select pg_advisory_xact_lock(?, ?)', [
      expect.any(Number),
      expect.any(Number),
    ]);
    transaction.mockRestore();
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

async function insertDemoParents(database: DatabaseManager): Promise<void> {
  const now = new Date();
  await database
    .query()
    .insertInto(FILES_DEMO_COLLECTIONS.profiles)
    .values([
      { id: 1, name: 'Profile 1', createdAt: now, updatedAt: now },
      { id: 2, name: 'Profile 2', createdAt: now, updatedAt: now },
    ])
    .execute();
  await database
    .query()
    .insertInto(FILES_DEMO_COLLECTIONS.orders)
    .values([
      { id: 1, number: 'ORDER-1', createdAt: now, updatedAt: now },
      { id: 2, number: 'ORDER-2', createdAt: now, updatedAt: now },
    ])
    .execute();
}

async function insertAttachment(
  database: DatabaseManager,
  file: NewFileRecord,
  orderId: number,
): Promise<void> {
  const now = new Date();
  await database
    .query()
    .insertInto(FILES_DEMO_COLLECTIONS.orderAttachments)
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
