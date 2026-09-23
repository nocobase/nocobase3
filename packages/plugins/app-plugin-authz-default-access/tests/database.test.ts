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
      await migration.down?.(context);
      for (const table of tables)
        expect(await client.schema.hasTable(table)).toBe(false);
    } finally {
      await database.destroy();
    }
  });
});
