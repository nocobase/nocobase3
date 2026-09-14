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

    expect(loaded.map(({ name }) => name)).toEqual([MIGRATION_NAME]);
    expect(loaded.map(({ checksum }) => checksum)).toEqual([
      expect.stringMatching(/^[a-f0-9]{64}$/),
    ]);
    await expect(migrator.latest()).resolves.toEqual({
      batch: 1,
      executed: [MIGRATION_NAME],
      skipped: [],
    });
    await expect(migrator.latest()).resolves.toEqual({
      batch: 1,
      executed: [],
      skipped: [MIGRATION_NAME],
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
    ]);
    await expect(migrator.rollback()).resolves.toEqual({
      batch: 1,
      rolledBack: [MIGRATION_NAME],
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
