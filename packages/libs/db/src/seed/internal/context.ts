import type { DatabaseConnection } from '../../database/connection.js';
import { createMigrationConnection } from '../../migration/internal/context.js';
import type { SeedContext, SeedConnection } from '../types.js';

export function createSeedContext(connection: DatabaseConnection): SeedContext {
  return {
    query: connection.query,
    connection: createSeedConnection(connection),
  };
}

export function createSeedConnection(
  connection: DatabaseConnection,
): SeedConnection {
  return createMigrationConnection(connection);
}
