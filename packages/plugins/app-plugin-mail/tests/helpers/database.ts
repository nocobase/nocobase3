import { resolve } from 'node:path';
import {
  createDatabaseManager,
  InMemoryCollectionMetadataStore,
  type DatabaseManager,
} from '@nocobase/db';
import sqlite from '@nocobase/db-sqlite';

export async function createMailTestDatabase(): Promise<DatabaseManager> {
  const database = createDatabaseManager({
    drivers: { sqlite },
    default: 'main',
    metadataStore: new InMemoryCollectionMetadataStore(),
    connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
  });
  try {
    await database
      .createMigrator({
        directory: resolve(import.meta.dirname, '../../database/migrations'),
        packageName: '@nocobase/app-plugin-mail',
      })
      .latest();
    return database;
  } catch (error) {
    await database.destroy();
    throw error;
  }
}
