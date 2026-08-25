import {
  createDatabaseManager,
  type DatabaseManager,
} from '@nocobase/database';

import migration from '../../src/migrations/202608190001_create_notification_tables.js';
import reliabilityMigration from '../../src/migrations/202608250001_add_notification_reliability_fields.js';

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
  await reliabilityMigration.up({
    builder: connection.builder,
    query: connection.query,
    connection,
  });
  return database;
}
