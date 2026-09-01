import { describe, expect, it } from 'vitest';
import {
  createDatabaseManager,
  createMigrator,
  SchemaManagementNotAllowedError,
} from '../../../src/index.js';

describe('Migrator schema management', () => {
  it('rejects latest and rollback for external connections before loading migrations', async () => {
    const database = createDatabaseManager({
      connections: {
        external: {
          dialect: 'sqlite',
          filename: ':memory:',
          schemaManagement: 'external',
        },
      },
    });
    const migrator = createMigrator({
      database,
      directory: '/directory/that/does/not/exist',
    });

    try {
      await expect(migrator.latest()).rejects.toMatchObject({
        code: 'SCHEMA_MANAGEMENT_NOT_ALLOWED',
        connection: 'external',
        operation: 'migration.latest',
      });
      await expect(migrator.rollback()).rejects.toBeInstanceOf(
        SchemaManagementNotAllowedError,
      );
    } finally {
      await database.destroy();
    }
  });
});
