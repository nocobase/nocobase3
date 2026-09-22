import targetMigration from '../database/migrations/202609200002_notification_in_app_target.js';
import { resolve } from 'node:path';

import sqlite from '@nocobase/db-sqlite';
import {
  createDatabaseManager,
  InMemoryCollectionMetadataStore,
  validateMigrations,
  type DatabaseManager,
  type Row,
} from '@nocobase/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DatabaseInAppStore } from '../server/store.js';

import instantMigration from '../database/migrations/202609180001_notification_in_app_instant_columns.js';

import migration from '../database/migrations/202608190002_create_notification_in_app_items.js';

interface SqliteClient {
  readonly schema: {
    hasTable(name: string): Promise<boolean>;
    hasColumn(table: string, column: string): Promise<boolean>;
  };
  raw<T extends Row = Row>(sql: string): Promise<readonly T[]>;
}

const MIGRATIONS_DIRECTORY = resolve(process.cwd(), 'database/migrations');
const MIGRATION_NAME = '202608190002_create_notification_in_app_items' as const;
const TARGET_MIGRATION_NAME = '202609200002_notification_in_app_target';
const INSTANT_MIGRATION_NAME =
  '202609180001_notification_in_app_instant_columns';

describe('in-app notification database migration', () => {
  let database: DatabaseManager;
  let metadataStore: InMemoryCollectionMetadataStore;

  beforeEach(() => {
    metadataStore = new InMemoryCollectionMetadataStore();
    database = createDatabaseManager({
      drivers: { sqlite },
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

  it('reads existing UTC timestamps through the database inbox', async () => {
    await migrateUp(database);
    const client = await database.connection().client<SqliteClient>();
    await client.raw(`INSERT INTO notification_in_app_items
      (id, delivery_id, notification_id, user_id, body, created_at, updated_at)
      VALUES ('legacy', 'delivery-legacy', 'notification-legacy', 'user-1', 'Test',
        '2026-09-17T12:00:00.123Z', '2026-09-17T12:00:00.123Z')`);
    const connection = database.connection();
    await instantMigration.up({
      builder: connection.builder,
      query: connection.query,
      connection,
    });
    await targetMigration.up({
      builder: connection.builder,
      query: connection.query,
      connection,
    });
    const store = new DatabaseInAppStore(database);
    await expect(store.list({ userId: 'user-1' })).resolves.toMatchObject([
      { id: 'legacy', createdAt: '2026-09-17T12:00:00.123Z' },
    ]);
    await expect(
      connection.collections.get('notificationInAppItems'),
    ).resolves.toMatchObject({
      fields: expect.arrayContaining(
        ['createdAt', 'updatedAt', 'readAt'].map((name) =>
          expect.objectContaining({ name, type: 'datetimeTz' }),
        ),
      ),
    });
    const delivered = await store.deliver({
      deliveryId: 'new-delivery',
      notificationId: 'new-notification',
      userId: 'user-1',
      message: { body: 'New message' },
      createdAt: '2026-09-18T12:00:00.456Z',
    });
    await expect(
      store.update({ id: delivered.id, userId: 'user-1', action: 'read' }),
    ).resolves.toMatchObject({ readAt: expect.stringMatching(/Z$/) });
    await expect(store.markAllRead('user-1')).resolves.toBe(1);
    await expect(store.countUnread('user-1')).resolves.toBe(0);
    await expect(store.list({ userId: 'other-user' })).resolves.toEqual([]);
    const page = await store.list({ userId: 'user-1', limit: 1 });
    await expect(
      store.list({
        userId: 'user-1',
        before: { id: page[0].id, createdAt: page[0].createdAt },
      }),
    ).resolves.toMatchObject([{ id: 'legacy' }]);
    await instantMigration.down?.({
      builder: connection.builder,
      query: connection.query,
      connection,
    });
    await expect(
      connection.collections.get('notificationInAppItems'),
    ).resolves.toMatchObject({
      fields: expect.arrayContaining(
        ['createdAt', 'updatedAt', 'readAt'].map((name) =>
          expect.objectContaining({ name, type: 'datetime' }),
        ),
      ),
    });
    await expect(
      client.schema.hasColumn('notification_in_app_items', 'read_at'),
    ).resolves.toBe(true);
    await expect(
      client.raw('SELECT count(*) AS count FROM notification_in_app_items'),
    ).resolves.toEqual([{ count: 2 }]);
  });

  it('adds structured targets without converting historical actionUrl values, and rolls back', async () => {
    await migrateUp(database);
    const connection = database.connection();
    const context = {
      builder: connection.builder,
      query: connection.query,
      connection,
    };
    await instantMigration.up(context);
    await connection.query
      .insertInto('notificationInAppItems')
      .values({
        id: 'old',
        deliveryId: 'old',
        notificationId: 'old',
        userId: 'u',
        body: 'Old',
        actionUrl: '/main/topics/123',
        createdAt: '2026-09-20T00:00:00.000Z',
        updatedAt: '2026-09-20T00:00:00.000Z',
      })
      .execute();
    await targetMigration.up(context);
    const client = await connection.client<SqliteClient>();
    expect(
      await client.schema.hasColumn('notification_in_app_items', 'target'),
    ).toBe(true);
    expect(
      await connection.collections.get('notificationInAppItems'),
    ).toMatchObject({
      fields: expect.arrayContaining([
        expect.objectContaining({ name: 'target', type: 'json' }),
      ]),
    });
    const store = new DatabaseInAppStore(database);
    const [old] = await store.list({ userId: 'u' });
    expect(old.target).toBeUndefined();
    expect(old).not.toHaveProperty('actionUrl');
    for (const target of [
      { type: 'route', path: '/topics/123?q=1#reply' },
      { type: 'url', url: 'https://example.com/main/topics/123' },
    ] as const) {
      const item = await store.deliver({
        deliveryId: target.type,
        notificationId: 'n',
        userId: 'u',
        message: { body: 'New', target },
        createdAt: '2026-09-20T00:00:00.000Z',
      });
      expect(
        (await store.list({ userId: 'u' })).find((row) => row.id === item.id)
          ?.target,
      ).toEqual(target);
      expect(
        (await store.update({ id: item.id, userId: 'u', action: 'read' }))
          ?.target,
      ).toEqual(target);
    }
    await targetMigration.down?.(context);
    expect(
      await client.schema.hasColumn('notification_in_app_items', 'target'),
    ).toBe(false);
    expect(
      await client.raw(
        'SELECT count(*) AS count FROM notification_in_app_items',
      ),
    ).toEqual([{ count: 3 }]);
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
      database.connection().collections.get('notificationInAppItems'),
    ).resolves.toMatchObject({
      fields: expect.arrayContaining([
        expect.objectContaining({ name: 'deliveryId' }),
        expect.objectContaining({ name: 'readAt' }),
      ]),
      indexes: expect.arrayContaining([
        expect.objectContaining({
          name: 'notification_in_app_delivery_unique',
          db: expect.objectContaining({ unique: true }),
        }),
        expect.objectContaining({ name: 'notification_in_app_user_idx' }),
      ]),
    });

    const row = {
      id: 'item-1',
      deliveryId: 'delivery-1',
      notificationId: 'notification-1',
      userId: 'user-1',
      body: 'Message',
      createdAt: '2026-08-31T00:00:00.000',
      updatedAt: '2026-08-31T00:00:00.000',
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
      database.connection().collections.get('notificationInAppItems'),
    ).resolves.toBeUndefined();
  });

  it('runs through the migration runner and records stable history', async () => {
    const historyTable = 'notification_in_app_test_migrations';
    const lockTable = 'notification_in_app_test_migration_lock';
    const migrator = database.createMigrator({
      directory: MIGRATIONS_DIRECTORY,
      packageName: '@nocobase/app-plugin-notification-in-app',
      tableName: historyTable,
      lockTableName: lockTable,
    });
    const loaded = await validateMigrations({
      directory: MIGRATIONS_DIRECTORY,
      packageName: '@nocobase/app-plugin-notification-in-app',
    });

    expect(loaded.map(({ name }) => name)).toEqual([
      MIGRATION_NAME,
      INSTANT_MIGRATION_NAME,
      TARGET_MIGRATION_NAME,
    ]);
    expect(loaded.map(({ checksum }) => checksum)).toEqual([
      expect.stringMatching(/^[a-f0-9]{64}$/),
      expect.stringMatching(/^[a-f0-9]{64}$/),
      expect.stringMatching(/^[a-f0-9]{64}$/),
    ]);
    await expect(migrator.latest()).resolves.toEqual({
      batch: 1,
      executed: [MIGRATION_NAME, INSTANT_MIGRATION_NAME, TARGET_MIGRATION_NAME],
      skipped: [],
      warnings: [],
    });
    await expect(migrator.latest()).resolves.toEqual({
      batch: 1,
      executed: [],
      skipped: [MIGRATION_NAME, INSTANT_MIGRATION_NAME, TARGET_MIGRATION_NAME],
      warnings: [],
    });

    const client = await database.connection().client<SqliteClient>();
    await expect(
      client.raw(
        `select package_name as packageName, name, batch, checksum from ${historyTable} order by id`,
      ),
    ).resolves.toEqual([
      {
        packageName: '@nocobase/app-plugin-notification-in-app',
        name: MIGRATION_NAME,
        batch: 1,
        checksum: loaded[0]?.checksum,
      },
      {
        packageName: '@nocobase/app-plugin-notification-in-app',
        name: INSTANT_MIGRATION_NAME,
        batch: 1,
        checksum: loaded[1]?.checksum,
      },
      {
        packageName: '@nocobase/app-plugin-notification-in-app',
        name: TARGET_MIGRATION_NAME,
        batch: 1,
        checksum: loaded[2]?.checksum,
      },
    ]);
    await expect(migrator.rollback()).resolves.toEqual({
      batch: 1,
      rolledBack: [
        TARGET_MIGRATION_NAME,
        INSTANT_MIGRATION_NAME,
        MIGRATION_NAME,
      ],
      warnings: [],
    });
    await expect(
      client.schema.hasTable('notification_in_app_items'),
    ).resolves.toBe(false);
    await expect(
      client.raw(`select name from ${historyTable} order by id`),
    ).resolves.toEqual([]);
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
