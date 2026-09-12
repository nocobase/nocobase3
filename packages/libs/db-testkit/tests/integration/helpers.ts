export {
  describeIntegrationDatabases,
  expectForeignKeyViolation,
  expectUniqueViolation,
  getColumnType,
  getDatabaseIntegrationAdapter,
  installDatabaseIntegrationAdapter,
  listColumns,
  listForeignKeys,
  listIndexes,
  useIntegrationDatabase,
} from '../../src/integration.js';
export type {
  IntegrationDatabaseSpec,
  IntegrationTestContext,
} from '../../src/integration.js';
