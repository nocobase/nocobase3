/**
 * Compatibility exports for integration suites that are being migrated.
 *
 * The lifecycle, connection configuration, cleanup, and catalog inspection
 * now live in @nocobase/db-testkit and are installed by a dialect package's
 * integration entrypoint.
 */
export {
  describeIntegrationDatabases,
  expectForeignKeyViolation,
  expectUniqueViolation,
  getColumnType,
  listColumns,
  listForeignKeys,
  listIndexes,
  useIntegrationDatabase,
} from '@nocobase/db-testkit';
export type {
  IntegrationDatabaseSpec,
  IntegrationTestContext,
} from '@nocobase/db-testkit';
