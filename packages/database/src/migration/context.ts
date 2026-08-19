import type { DatabaseConnection } from '../database/index.js';
import type { MigrationContext, MigrationConnection } from './types.js';

export function createMigrationContext(connection: DatabaseConnection): MigrationContext {
  return {
    builder: connection.builder,
    query: connection.query,
    connection: createMigrationConnection(connection),
  };
}

export function createMigrationConnection(connection: DatabaseConnection): MigrationConnection {
  return {
    name: connection.name,
    driver: connection.driver,
    dialect: connection.dialect,
    capabilities: connection.capabilities,
    client: connection.client.bind(connection) as MigrationConnection['client'],
  };
}
