import {
  createDatabaseManager,
  InMemoryCollectionMetadataStore,
  type DatabaseManager,
} from '@nocobase/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import migration from '../database/migrations/202608190002_create_notification_in_app_items.js';

interface SqliteClient {
  readonly schema: {
    hasTable(name: string): Promise<boolean>;
    hasColumn(table: string, column: string): Promise<boolean>;
  };
  raw(sql: string): Promise<readonly { readonly name: string }[]>;
}

describe('in-app notification database migration', () => {
  let database: DatabaseManager;
  let metadataStore: InMemoryCollectionMetadataStore;

  beforeEach(() => {
    metadataStore = new InMemoryCollectionMetadataStore();
    database = createDatabaseManager({
      default: 'main',
      metadataStore,
      connections: {
        main: { dialect: 'sqlite', filename: ':memory:' },
      },
    });
  });

  afterEach(async () => {
    await database.destroy();
  });

  it('creates the physical schema, indexes, constraints, and metadata', async () => {
    await migrateUp(database);
    const client = await database.connection().client<SqliteClient>();

    await expect(
      client.schema.hasTable('notification_in_app_items'),
    ).resolves.toBe(true);
    await expect(
      Promise.all([
        client.schema.hasColumn('notification_in_app_items', 'delivery_id'),
        client.schema.hasColumn('notification_in_app_items', 'read_at'),
        client.schema.hasColumn('notification_in_app_items', 'version'),
      ]),
    ).resolves.toEqual([true, true, false]);
    await expect(
      client.raw('PRAGMA index_list(notification_in_app_items)'),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'notification_in_app_delivery_unique',
        }),
        expect.objectContaining({ name: 'notification_in_app_user_idx' }),
      ]),
    );
    await expect(
      metadataStore.getCollection('notificationInAppItems'),
    ).resolves.toMatchObject({
      fields: expect.arrayContaining([
        expect.objectContaining({ name: 'deliveryId' }),
        expect.objectContaining({ name: 'readAt' }),
      ]),
      indexes: expect.arrayContaining([
        expect.objectContaining({ name: 'notification_in_app_user_idx' }),
      ]),
      constraints: expect.arrayContaining([
        expect.objectContaining({
          name: 'notification_in_app_delivery_unique',
        }),
      ]),
    });

    const row = {
      id: 'item-1',
      deliveryId: 'delivery-1',
      notificationId: 'notification-1',
      userId: 'user-1',
      body: 'Message',
      createdAt: '2026-08-31T00:00:00.000Z',
      updatedAt: '2026-08-31T00:00:00.000Z',
    };
    await database
      .query()
      .insertInto('notificationInAppItems')
      .values(row)
      .execute();
    await expect(
      database
        .query()
        .insertInto('notificationInAppItems')
        .values({ ...row, id: 'item-2' })
        .execute(),
    ).rejects.toThrow(/unique/i);
  });

  it('drops the physical schema and metadata', async () => {
    await migrateUp(database);
    await migrateDown(database);
    const client = await database.connection().client<SqliteClient>();

    await expect(
      client.schema.hasTable('notification_in_app_items'),
    ).resolves.toBe(false);
    await expect(
      metadataStore.getCollection('notificationInAppItems'),
    ).resolves.toBeUndefined();
  });
});

async function migrateUp(database: DatabaseManager): Promise<void> {
  const connection = database.connection();
  await migration.up({
    builder: connection.builder,
    query: connection.query,
    connection,
  });
}

async function migrateDown(database: DatabaseManager): Promise<void> {
  const connection = database.connection();
  await migration.down?.({
    builder: connection.builder,
    query: connection.query,
    connection,
  });
}
