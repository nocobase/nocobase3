import {
  createDatabaseManager,
  defineDatabase,
  type DatabaseManager,
} from '@nocobase/app-database';

import type { AppDatabaseConfig } from './types.js';

export function createAppDatabaseManager(
  config: AppDatabaseConfig,
): DatabaseManager | undefined {
  if (config.default === 'none') {
    return undefined;
  }

  return createDatabaseManager(
    defineDatabase({
      default: config.default,
      connections: config.connections,
    }),
  );
}
