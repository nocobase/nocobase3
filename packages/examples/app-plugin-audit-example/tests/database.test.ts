// @vitest-environment node
import { resolve } from 'node:path';
import { createDatabaseManager } from '@nocobase/db';
import sqlite from '@nocobase/db-sqlite';
import { expect, it } from 'vitest';
it('creates and reverses both physical tables and collection metadata', async () => {
  const database = createDatabaseManager({
    drivers: { sqlite },
    connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
  });
  try {
    const migrator = database.createMigrator({
      directory: resolve(import.meta.dirname, '../database/migrations'),
      packageName: '@nocobase/app-plugin-audit-example',
    });
    await migrator.latest();
    for (const name of ['auditExampleCustomers', 'auditExampleOperations']) {
      expect(
        await database.connection().collections.getPhysical(name),
      ).toBeDefined();
      expect(
        (await database.connection().collectionMetadata.get(name))?.document,
      ).toBeDefined();
    }
    await migrator.rollback();
    for (const name of ['auditExampleCustomers', 'auditExampleOperations']) {
      expect(
        await database.connection().collections.getPhysical(name),
      ).toBeUndefined();
      expect(
        await database.connection().collectionMetadata.get(name),
      ).toBeUndefined();
    }
  } finally {
    await database.destroy();
  }
});
