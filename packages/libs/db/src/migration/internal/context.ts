import type { ServiceResolver } from '@nocobase/service-provider';
import { emptyDatabaseTaskContainer } from '../../task-container.js';
import {
  emptyDatabaseTaskConfig,
  type DatabaseTaskConfig,
} from '../../task-config.js';
import type { DatabaseConnection } from '../../database/connection.js';
import type { MigrationContext, MigrationConnection } from '../types.js';

export function createMigrationContext(
  connection: DatabaseConnection,
  config: DatabaseTaskConfig = emptyDatabaseTaskConfig,
  container: ServiceResolver = emptyDatabaseTaskContainer,
): MigrationContext {
  return {
    config,
    container,
    builder: connection.builder,
    query: connection.query,
    connection: createMigrationConnection(connection),
  };
}

export function createMigrationConnection(
  connection: DatabaseConnection,
): MigrationConnection {
  return {
    name: connection.name,
    driver: connection.driver,
    dialect: connection.dialect,
    capabilities: connection.capabilities,
    client: connection.client.bind(connection),
  };
}
