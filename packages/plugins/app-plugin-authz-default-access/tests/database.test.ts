import { fileURLToPath } from 'node:url';
import sqlite from '@nocobase/db-sqlite';
import {
  createDatabaseManager,
  InMemoryCollectionMetadataStore,
  validateMigrations,
} from '@nocobase/db';
import { describe, expect, it } from 'vitest';
import migration from '../database/migrations/202608210002_create_default_access_rules.js';

const tables = ['authorization_default_access_rules'];

describe('@nocobase/app-plugin-authz-default-access migration', () => {
  it('owns its rule migration', async () => {
    const migrationsDirectory = fileURLToPath(
      new URL('../database/migrations', import.meta.url),
    );
    await expect(
      validateMigrations(migrationsDirectory),
    ).resolves.toMatchObject([
      { name: '202608210002_create_default_access_rules' },
    ]);
  });

  it('creates and removes its physical tables', async () => {
    const database = createDatabaseManager({
      drivers: { sqlite },
      default: 'main',
      metadataStore: new InMemoryCollectionMetadataStore(),
      connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
    });
    try {
      const connection = database.connection();
      const context = {
        builder: connection.builder,
        query: connection.query,
        connection,
      };
      const client = await connection.client<{
        schema: { hasTable(name: string): Promise<boolean> };
      }>();
      await migration.up(context);
      for (const table of tables)
        expect(await client.schema.hasTable(table)).toBe(true);
      const row = (id: string, key: string) => ({
        id,
        key,
        resourceType: 'business',
        resourceId: 'sales.quotes',
        actions: '[]',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const rules = 'authorizationDefaultAccessRules';
      await connection.query.insertInto(rules).values(row('1', 'a')).execute();
      // One rule per resource, and one per key.
      await expect(
        connection.query.insertInto(rules).values(row('2', 'b')).execute(),
      ).rejects.toThrow();
      await expect(
        connection.query
          .insertInto(rules)
          .values({ ...row('3', 'a'), resourceId: 'sales.orders' })
          .execute(),
      ).rejects.toThrow();
      await migration.down?.(context);
      for (const table of tables)
        expect(await client.schema.hasTable(table)).toBe(false);
    } finally {
      await database.destroy();
    }
  });
});
