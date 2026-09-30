import {
  createDatabaseManager,
  InMemoryCollectionMetadataStore,
  type DatabaseDriverRegistration,
  type DatabaseManager,
} from '@nocobase/db';
import type { MysqlConnectionConfig } from '@nocobase/db-mysql';
import type { OracleConnectionConfig } from '@nocobase/db-oracle';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import targetMigration from '../database/migrations/202609200002_notification_in_app_target.js';
import instantMigration from '../database/migrations/202609180001_notification_in_app_instant_columns.js';
import migration from '../database/migrations/202608190002_create_notification_in_app_items.js';
import { DatabaseInAppStore } from '../server/store.js';

type TestedDialect = 'mysql' | 'oracle';

interface SchemaClient {
  readonly schema: {
    hasTable(name: string): Promise<boolean>;
    hasColumn(table: string, column: string): Promise<boolean>;
    dropTableIfExists(name: string): Promise<void>;
  };
}

const dialect = selectedDialect();
const migrationDirectory = resolve(process.cwd(), 'database/migrations');
const historyTable = 'notification_in_app_dialect_test_migrations';
const lockTable = 'notification_in_app_dialect_test_migration_lock';

describe.skipIf(!dialect)(
  `in-app notification migration on ${dialect ?? 'skipped'}`,
  () => {
    let database: DatabaseManager;

    beforeEach(async () => {
      const drivers: Record<string, DatabaseDriverRegistration> = {};
      if (dialect === 'mysql') {
        drivers.mysql = (await import('@nocobase/db-mysql')).mysqlDriver;
      } else {
        drivers.oracle = (await import('@nocobase/db-oracle')).oracleDriver;
      }
      database = createDatabaseManager({
        default: 'main',
        drivers,
        metadataStore: new InMemoryCollectionMetadataStore(),
        connections: { main: connectionConfig(dialect!) },
      });
    });

    afterEach(async () => {
      const client = await database.connection().client<SchemaClient>();
      for (const table of [
        'notification_in_app_items',
        historyTable,
        lockTable,
      ]) {
        await client.schema.dropTableIfExists(table);
      }
      await database.destroy();
    });

    it('runs, exercises, and rolls back the complete migration chain', async () => {
      const connection = database.connection();
      const migrator = database.createMigrator({
        directory: migrationDirectory,
        packageName: '@nocobase/app-plugin-notification-in-app',
        tableName: historyTable,
        lockTableName: lockTable,
      });

      await expect(migrator.latest()).resolves.toEqual({
        batch: 1,
        executed: [migration.name, instantMigration.name, targetMigration.name],
        skipped: [],
        warnings: [],
      });

      const client = await connection.client<SchemaClient>();
      await expect(
        Promise.all([
          client.schema.hasTable('notification_in_app_items'),
          client.schema.hasColumn('notification_in_app_items', 'target'),
          client.schema.hasColumn('notification_in_app_items', 'read_at'),
        ]),
      ).resolves.toEqual([true, true, true]);
      await expect(
        connection.collections.get('notificationInAppItems'),
      ).resolves.toMatchObject({
        fields: expect.arrayContaining([
          expect.objectContaining({ name: 'target', type: 'json' }),
          expect.objectContaining({ name: 'createdAt', type: 'datetimeTz' }),
          expect.objectContaining({ name: 'readAt', type: 'datetimeTz' }),
        ]),
      });

      const store = new DatabaseInAppStore(database);
      const delivered = await store.deliver({
        deliveryId: 'dialect-delivery-1',
        notificationId: 'dialect-notification-1',
        userId: 'dialect-user-1',
        message: {
          title: 'Dialect migration',
          body: 'The target survives a real database round trip.',
          target: { type: 'route', path: '/tasks/1' },
        },
        createdAt: '2026-09-20T12:34:56.789Z',
      });
      await expect(
        store.list({ userId: 'dialect-user-1' }),
      ).resolves.toMatchObject([
        {
          id: delivered.id,
          target: { type: 'route', path: '/tasks/1' },
        },
      ]);

      await expect(migrator.rollback()).resolves.toMatchObject({
        batch: 1,
        rolledBack: [
          targetMigration.name,
          instantMigration.name,
          migration.name,
        ],
        warnings: [],
      });
      await expect(
        client.schema.hasTable('notification_in_app_items'),
      ).resolves.toBe(false);
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

function connectionConfig(
  selected: TestedDialect,
): MysqlConnectionConfig | OracleConnectionConfig {
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
