import {
  createDatabaseManager,
  type DatabaseManager,
} from '@nocobase/app-database';

import migration from '../../database/migrations/202608190001_create_notification_tables.js';

export async function createNotificationTestDatabase(): Promise<DatabaseManager> {
  const database = createDatabaseManager({
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
  return database;
}
