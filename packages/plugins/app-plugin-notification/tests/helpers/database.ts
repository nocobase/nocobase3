import sqlite from '@nocobase/db-sqlite';
import { createDatabaseManager, type DatabaseManager } from '@nocobase/db';

import migration from '../../database/migrations/202608190001_create_notification_tables.js';
import idempotencyMigration from '../../database/migrations/202609080001_create_notification_idempotency.js';
import instantMigration from '../../database/migrations/202609130001_notification_instant_columns.js';

export async function createNotificationTestDatabase(): Promise<DatabaseManager> {
  const database = createDatabaseManager({
    drivers: { sqlite },
    default: 'main',
    connections: {
      main: {
        dialect: 'sqlite',
        filename: ':memory:',
      },
    },
  });
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
  await instantMigration.up({
    builder: connection.builder,
    query: connection.query,
    connection,
  });
  return database;
}
