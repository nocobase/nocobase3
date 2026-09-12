import { resolve } from 'node:path';

import {
  createDatabaseManager,
  InMemoryCollectionMetadataStore,
  type ConnectionConfig,
  type DatabaseManager,
  type Row,
} from '@nocobase/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import baseMigration from '../database/migrations/202608190001_create_notification_tables.js';
import idempotencyMigration from '../database/migrations/202609080001_create_notification_idempotency.js';

type TestedDialect = 'mysql' | 'oracle';

interface DispatchRow extends Row {
  readonly id: string;
  readonly sourceType: string;
  readonly idempotencyKey?: string | null;
  readonly requestFingerprint?: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

interface SchemaClient {
  readonly schema: {
    hasTable(name: string): Promise<boolean>;
    hasColumn(table: string, column: string): Promise<boolean>;
    dropTableIfExists(name: string): Promise<void>;
  };
}

const dialect = selectedDialect();
const migrationDirectory = resolve(process.cwd(), 'database/migrations');
const historyTable = 'notification_dialect_test_migrations';
const lockTable = 'notification_dialect_test_migration_lock';
const physicalTables = [
  'notification_delivery_retry_audits',
  'notification_delivery_attempts',
  'notification_deliveries',
  'notification_dispatches',
] as const;

describe.skipIf(!dialect)(
  `notification migration on a non-partial-index dialect [${dialect ?? 'skipped'}]`,
  () => {
    let database: DatabaseManager;

    beforeEach(() => {
      database = createDatabaseManager({
        default: 'main',
        metadataStore: new InMemoryCollectionMetadataStore(),
        connections: { main: connectionConfig(dialect!) },
      });
    });

    afterEach(async () => {
      const client = await database.connection().client<SchemaClient>();
      for (const table of [...physicalTables, historyTable, lockTable]) {
        await client.schema.dropTableIfExists(table);
      }
      await database.destroy();
    });

    it('runs and rolls back through the migration runner', async () => {
      const connection = database.connection();
      const migrator = database.createMigrator({
        directory: migrationDirectory,
        packageName: '@nocobase/app-plugin-notification',
        tableName: historyTable,
        lockTableName: lockTable,
      });

      expect(connection.capabilities.partialIndexes).toBe(false);
      await expect(migrator.upTo(baseMigration.name)).resolves.toEqual({
        batch: 1,
        executed: [baseMigration.name],
        skipped: [],
      });
      await connection.query
        .insertInto<DispatchRow>('notificationDispatches')
        .values([
          legacyDispatch('notification-dialect-legacy-1'),
          legacyDispatch('notification-dialect-legacy-2'),
        ])
        .execute();

      await expect(migrator.latest()).resolves.toEqual({
        batch: 2,
        executed: [idempotencyMigration.name],
        skipped: [baseMigration.name],
      });
      await expect(
        connection.schemaInspector.getPhysicalCollection({
          tableName: 'notification_dispatches',
        }),
      ).resolves.toMatchObject({
        columns: expect.arrayContaining([
          expect.objectContaining({
            columnName: 'idempotency_key',
            dataType: 'string',
            length: 191,
            nullable: true,
          }),
          expect.objectContaining({
            columnName: 'request_fingerprint',
            dataType: 'string',
            length: 80,
            nullable: true,
          }),
        ]),
      });
      await expect(
        connection.collections.get('notificationDeliveryRetryAudits'),
      ).resolves.toMatchObject({
        fields: expect.arrayContaining([
          expect.objectContaining({
            name: 'id',
            type: 'string',
            length: 36,
            nullable: false,
          }),
          expect.objectContaining({
            name: 'resolution',
            type: 'json',
            nullable: false,
          }),
        ]),
      });

      await connection.query
        .insertInto<DispatchRow>('notificationDispatches')
        .values(legacyDispatch('notification-dialect-legacy-3'))
        .execute();
      await connection.query
        .insertInto<DispatchRow>('notificationDispatches')
        .values(currentDispatch('notification-dialect-current-1'))
        .execute();
      await expect(
        connection.query
          .insertInto<DispatchRow>('notificationDispatches')
          .values(currentDispatch('notification-dialect-current-2'))
          .execute(),
      ).rejects.toThrow();

      await expect(migrator.rollback()).resolves.toEqual({
        batch: 2,
        rolledBack: [idempotencyMigration.name],
      });
      const client = await connection.client<SchemaClient>();
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
          client.schema.hasColumn(
            'notification_deliveries',
            'retry_resolution',
          ),
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
      await expect(migrator.rollback()).resolves.toEqual({
        batch: 1,
        rolledBack: [baseMigration.name],
      });
    });
  },
);

function selectedDialect(): TestedDialect | undefined {
  const value = process.env.NOTIFICATION_MIGRATION_DIALECT;
  if (value === undefined || value === '') return undefined;
  if (value === 'mysql' || value === 'oracle') return value;
  throw new Error(
    `Unsupported notification migration test dialect "${value}". Expected mysql or oracle.`,
  );
}

function connectionConfig(selected: TestedDialect): ConnectionConfig {
  if (selected === 'mysql') {
    return {
      dialect: 'mysql',
      driver: 'mysql2',
      host: process.env.MYSQL_HOST ?? '127.0.0.1',
      port: Number(process.env.MYSQL_PORT ?? 13306),
      username: process.env.MYSQL_USER ?? 'nocobase',
      password: process.env.MYSQL_PASSWORD ?? 'nocobase',
      database: process.env.MYSQL_DATABASE ?? 'nocobase_collection_builder',
    };
  }
  return {
    dialect: 'oracle',
    driver: 'oracledb',
    host: process.env.ORACLE_HOST ?? '127.0.0.1',
    port: Number(process.env.ORACLE_PORT ?? 11521),
    username: process.env.ORACLE_USER ?? 'nocobase',
    password: process.env.ORACLE_PASSWORD ?? 'nocobase',
    serviceName: process.env.ORACLE_SERVICE_NAME ?? 'FREEPDB1',
  };
}

function legacyDispatch(id: string): DispatchRow {
  const createdAt = new Date('2026-09-01T00:00:00.000Z');
  return {
    id,
    sourceType: 'legacy',
    createdAt,
    updatedAt: createdAt,
  };
}

function currentDispatch(id: string): DispatchRow {
  return {
    ...legacyDispatch(id),
    sourceType: 'current',
    idempotencyKey: 'notification-dialect-business-key',
    requestFingerprint: 'v1:notification-dialect-fingerprint',
  };
}
