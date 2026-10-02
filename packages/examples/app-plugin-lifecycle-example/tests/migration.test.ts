// The migration against a real database: up creates the example records and
// the lifecycle log with their metadata, and down removes all of them.
import path from 'node:path';

import { createDatabaseManager } from '@nocobase/db';
import sqlite from '@nocobase/db-sqlite';
import { expect, it } from 'vitest';

interface SchemaClient {
  readonly schema: {
    hasTable(name: string): Promise<boolean>;
    hasColumn(table: string, column: string): Promise<boolean>;
  };
  raw(sql: string): Promise<readonly { readonly sql: string | null }[]>;
}

const COLLECTIONS: Readonly<Record<string, string>> = {
  lifecycleExampleTickets: 'lifecycle_example_tickets',
  lifecycleExampleExpenses: 'lifecycle_example_expenses',
  lifecycleExampleTransitions: 'lifecycle_example_transitions',
  lifecycleExampleEffectRuns: 'lifecycle_example_effect_runs',
};

it('creates the collections on up and removes them on down', async () => {
  const database = createDatabaseManager({
    default: 'main',
    drivers: { sqlite },
    connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
  });
  try {
    const migrator = database.createMigrator({
      connection: 'main',
      directory: path.resolve(import.meta.dirname, '../database/migrations'),
      packageName: '@nocobase/app-plugin-lifecycle-example',
    });
    await migrator.latest();
    const connection = database.connection('main');
    const client = await connection.client<SchemaClient>();
    for (const [name, physical] of Object.entries(COLLECTIONS)) {
      expect(await client.schema.hasTable(physical)).toBe(true);
      expect(await connection.collectionMetadata.get(name)).toBeDefined();
    }
    for (const physical of [
      'lifecycle_example_tickets',
      'lifecycle_example_expenses',
    ])
      expect(await client.schema.hasColumn(physical, 'lifecycle_version')).toBe(
        true,
      );
    const unique = (
      await client.raw(
        "select sql from sqlite_master where type = 'index' and sql like '%UNIQUE%'",
      )
    )
      .map((row) => row.sql ?? '')
      .join('\n');
    expect(unique).toMatch(
      /lifecycle_example_transitions.*lifecycle.*record_id.*version/,
    );
    // The request key is unique only where there is one.
    expect(unique).toMatch(
      /lifecycle_example_transitions.*request_id[^\n]*where[^\n]*request_id[^\n]*is not null/i,
    );

    await migrator.rollback();
    for (const [name, physical] of Object.entries(COLLECTIONS)) {
      expect(await client.schema.hasTable(physical)).toBe(false);
      expect(await connection.collectionMetadata.get(name)).toBeUndefined();
    }
  } finally {
    await database.destroy();
  }
});
