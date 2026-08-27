import type { DatabaseManager } from '@nocobase/app-database';

import type { DatabaseFileStoreOptions, FileStore } from './types.js';

export function createDatabaseFileStore(
  _database: DatabaseManager,
  _options: DatabaseFileStoreOptions,
): FileStore {
  throw new Error('Database file store is not implemented yet.');
}
