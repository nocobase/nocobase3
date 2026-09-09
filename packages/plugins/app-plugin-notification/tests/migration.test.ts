import {
  createDatabaseManager,
  InMemoryCollectionMetadataStore,
  type DatabaseManager,
  type Row,
} from '@nocobase/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import migration from '../database/migrations/202608190001_create_notification_tables.js';
import idempotencyMigration from '../database/migrations/202609080001_create_notification_idempotency.js';

interface SqliteClient {
  readonly schema: {
    hasTable(name: string): Promise<boolean>;
    hasColumn(table: string, column: string): Promise<boolean>;
  };
  raw<T extends Row = Row>(sql: string): Promise<readonly T[]>;
}

const COLLECTIONS = [
  ['notificationDispatches', 'notification_dispatches'],
  ['notificationDeliveries', 'notification_deliveries'],
  ['notificationDeliveryAttempts', 'notification_delivery_attempts'],
  ['notificationDeliveryRetryAudits', 'notification_delivery_retry_audits'],
] as const;

interface DispatchRow extends Row {
  readonly id: string;
  readonly sourceType: string;
  readonly idempotencyKey?: string | null;
  readonly requestFingerprint?: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

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
    ).resolves.toEqual([true, true, true, true]);
    await expect(
      Promise.all([
        client.schema.hasColumn('notification_deliveries', 'last_error'),
        client.schema.hasColumn(
          'notification_delivery_attempts',
          'error_message',
        ),
        client.schema.hasColumn('notification_dispatches', 'idempotency_key'),
        client.schema.hasColumn(
          'notification_dispatches',
          'request_fingerprint',
        ),
        client.schema.hasColumn('notification_deliveries', 'retry_resolution'),
        client.schema.hasColumn(
          'notification_delivery_attempts',
          'retry_resolution',
        ),
        client.schema.hasColumn(
          'notification_deliveries',
          'provider_idempotency',
        ),
        client.schema.hasColumn(
          'notification_delivery_retry_audits',
          'resolution',
        ),
      ]),
    ).resolves.toEqual([true, true, true, true, true, true, true, true]);
    await expect(
      client.raw('PRAGMA index_list(notification_dispatches)'),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'notification_dispatch_idempotency_unique',
          unique: 1,
        }),
      ]),
    );
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
      client.raw('PRAGMA index_list(notification_delivery_retry_audits)'),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'notification_retry_audits_delivery_idx',
        }),
      ]),
    );
    await expect(
      database.connection().collections.get('notificationDeliveries'),
    ).resolves.toMatchObject({
      fields: expect.arrayContaining([
        expect.objectContaining({ name: 'notificationId' }),
        expect.objectContaining({ name: 'lastError' }),
        expect.objectContaining({ name: 'providerIdempotency' }),
      ]),
      indexes: expect.arrayContaining([
        expect.objectContaining({
          name: 'notification_deliveries_notification_idx',
        }),
        expect.objectContaining({ name: 'notification_deliveries_ready_idx' }),
      ]),
    });
    await expect(
      database.connection().collections.get('notificationDeliveryRetryAudits'),
    ).resolves.toMatchObject({
      fields: expect.arrayContaining([
        expect.objectContaining({ name: 'deliveryId' }),
        expect.objectContaining({ name: 'resolution' }),
        expect.objectContaining({ name: 'providerIdempotency' }),
      ]),
      indexes: expect.arrayContaining([
        expect.objectContaining({
          name: 'notification_retry_audits_delivery_idx',
        }),
      ]),
    });
  });

  it('reverses only the idempotency migration and leaves the base schema intact', async () => {
    await migrateUp(database);
    const connection = database.connection();
    await idempotencyMigration.down?.({
      builder: connection.builder,
      query: connection.query,
      connection,
    });
    const client = await connection.client<SqliteClient>();

    await expect(
      Promise.all(
        COLLECTIONS.slice(0, 3).map(([, table]) =>
          client.schema.hasTable(table),
        ),
      ),
    ).resolves.toEqual([true, true, true]);
    await expect(
      client.schema.hasTable('notification_delivery_retry_audits'),
    ).resolves.toBe(false);
    await expect(
      Promise.all([
        client.schema.hasColumn('notification_dispatches', 'idempotency_key'),
        client.schema.hasColumn(
          'notification_dispatches',
          'request_fingerprint',
        ),
        client.schema.hasColumn('notification_deliveries', 'retry_resolution'),
        client.schema.hasColumn(
          'notification_deliveries',
          'provider_idempotency',
        ),
        client.schema.hasColumn(
          'notification_delivery_attempts',
          'retry_resolution',
        ),
      ]),
    ).resolves.toEqual([false, false, false, false, false]);
    await expect(
      database.connection().collections.get('notificationDispatches'),
    ).resolves.toMatchObject({
      fields: expect.not.arrayContaining([
        expect.objectContaining({ name: 'idempotencyKey' }),
      ]),
      constraints: expect.not.arrayContaining([
        expect.objectContaining({
          name: 'notification_dispatch_idempotency_unique',
        }),
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
    ).resolves.toEqual([false, false, false, false]);
    for (const [collection] of COLLECTIONS) {
      await expect(
        database.connection().collections.get(collection),
      ).resolves.toBeUndefined();
    }
  });

  it('preserves legacy rows while enforcing uniqueness only for non-null idempotency keys', async () => {
    const connection = database.connection();
    await migration.up({
      builder: connection.builder,
      query: connection.query,
      connection,
    });
    await connection.query
      .insertInto<DispatchRow>('notificationDispatches')
      .values([
        {
          id: 'notification-1',
          sourceType: 'legacy',
          createdAt: '2026-09-01T00:00:00.000Z',
          updatedAt: '2026-09-01T00:00:00.000Z',
        },
        {
          id: 'notification-2',
          sourceType: 'legacy',
          createdAt: '2026-09-01T00:00:00.000Z',
          updatedAt: '2026-09-01T00:00:00.000Z',
        },
      ])
      .execute();

    await idempotencyMigration.up({
      builder: connection.builder,
      query: connection.query,
      connection,
    });

    const rows = await connection.query
      .selectFrom<DispatchRow>('notificationDispatches')
      .select(['id', 'idempotencyKey', 'requestFingerprint'])
      .orderBy('id', 'asc')
      .execute<DispatchRow>();
    expect(rows).toEqual([
      {
        id: 'notification-1',
        idempotencyKey: null,
        requestFingerprint: null,
      },
      {
        id: 'notification-2',
        idempotencyKey: null,
        requestFingerprint: null,
      },
    ]);
    const [index] = await (
      await connection.client<SqliteClient>()
    ).raw<{
      readonly sql: string;
    }>(
      "SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'notification_dispatch_idempotency_unique'",
    );
    expect(index?.sql).toContain('where `idempotency_key` is not null');

    await connection.query
      .insertInto<DispatchRow>('notificationDispatches')
      .values({
        id: 'notification-3',
        sourceType: 'legacy',
        idempotencyKey: null,
        requestFingerprint: null,
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
      })
      .execute();
    const createWithKey = (id: string) =>
      connection.query
        .insertInto<DispatchRow>('notificationDispatches')
        .values({
          id,
          sourceType: 'current',
          idempotencyKey: 'business:key',
          requestFingerprint: 'v1:fingerprint',
          createdAt: '2026-09-01T00:00:00.000Z',
          updatedAt: '2026-09-01T00:00:00.000Z',
        })
        .execute();
    await createWithKey('notification-4');
    await expect(createWithKey('notification-5')).rejects.toThrow();
  });

  it('supports the non-partial-index migration branch and its rollback', async () => {
    const connection = database.connection();
    await migration.up({
      builder: connection.builder,
      query: connection.query,
      connection,
    });
    const withoutPartialIndexes = new Proxy(connection, {
      get(target, property, receiver) {
        if (property === 'capabilities') {
          return { ...target.capabilities, partialIndexes: false };
        }
        return Reflect.get(target, property, receiver);
      },
    });

    await idempotencyMigration.up({
      builder: connection.builder,
      query: connection.query,
      connection: withoutPartialIndexes,
    });
    const [index] = await (
      await connection.client<SqliteClient>()
    ).raw<{ readonly sql: string }>(
      "SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'notification_dispatch_idempotency_unique'",
    );
    expect(index?.sql.toLowerCase()).not.toContain(' where ');

    await idempotencyMigration.down?.({
      builder: connection.builder,
      query: connection.query,
      connection: withoutPartialIndexes,
    });
    await expect(
      (await connection.client<SqliteClient>()).schema.hasColumn(
        'notification_dispatches',
        'idempotency_key',
      ),
    ).resolves.toBe(false);
  });
});

async function migrateUp(database: DatabaseManager): Promise<void> {
  const connection = database.connection();
  await migration.up({
    builder: connection.builder,
    query: connection.query,
    connection,
  });
  await idempotencyMigration.up({
    builder: connection.builder,
    query: connection.query,
    connection,
  });
}

async function migrateDown(database: DatabaseManager): Promise<void> {
  const connection = database.connection();
  await idempotencyMigration.down?.({
    builder: connection.builder,
    query: connection.query,
    connection,
  });
  await migration.down?.({
    builder: connection.builder,
    query: connection.query,
    connection,
  });
}
