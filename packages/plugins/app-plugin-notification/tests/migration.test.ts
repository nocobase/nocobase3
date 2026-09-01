import {
  createDatabaseManager,
  InMemoryCollectionMetadataStore,
  type DatabaseManager,
} from '@nocobase/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import migration from '../database/migrations/202608190001_create_notification_tables.js';

interface SqliteClient {
  readonly schema: {
    hasTable(name: string): Promise<boolean>;
    hasColumn(table: string, column: string): Promise<boolean>;
  };
  raw(sql: string): Promise<readonly { readonly name: string }[]>;
}

const COLLECTIONS = [
  ['notificationDispatches', 'notification_dispatches'],
  ['notificationDeliveries', 'notification_deliveries'],
  ['notificationDeliveryAttempts', 'notification_delivery_attempts'],
] as const;

describe('notification database migration', () => {
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
      Promise.all(
        COLLECTIONS.map(([, table]) => client.schema.hasTable(table)),
      ),
    ).resolves.toEqual([true, true, true]);
    await expect(
      Promise.all([
        client.schema.hasColumn('notification_deliveries', 'last_error'),
        client.schema.hasColumn(
          'notification_delivery_attempts',
          'error_message',
        ),
      ]),
    ).resolves.toEqual([true, true]);
    await expect(
      client.raw('PRAGMA index_list(notification_deliveries)'),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'notification_deliveries_notification_idx',
        }),
        expect.objectContaining({ name: 'notification_deliveries_ready_idx' }),
      ]),
    );
    await expect(
      client.raw('PRAGMA index_list(notification_delivery_attempts)'),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'notification_attempt_sequence_unique',
        }),
      ]),
    );
    await expect(
      metadataStore.getCollection('notificationDeliveries'),
    ).resolves.toMatchObject({
      fields: expect.arrayContaining([
        expect.objectContaining({ name: 'notificationId' }),
        expect.objectContaining({ name: 'lastError' }),
      ]),
      indexes: expect.arrayContaining([
        expect.objectContaining({
          name: 'notification_deliveries_notification_idx',
        }),
        expect.objectContaining({ name: 'notification_deliveries_ready_idx' }),
      ]),
    });
  });

  it('drops the physical schema and metadata in reverse dependency order', async () => {
    await migrateUp(database);
    await migrateDown(database);
    const client = await database.connection().client<SqliteClient>();

    await expect(
      Promise.all(
        COLLECTIONS.map(([, table]) => client.schema.hasTable(table)),
      ),
    ).resolves.toEqual([false, false, false]);
    for (const [collection] of COLLECTIONS) {
      await expect(
        metadataStore.getCollection(collection),
      ).resolves.toBeUndefined();
    }
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
