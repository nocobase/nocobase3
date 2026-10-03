// The migration against a real database: up creates every collection with
// its metadata, and down removes all of them again.
import path from 'node:path';

import { createDatabaseManager } from '@nocobase/db';
import sqlite from '@nocobase/db-sqlite';
import { expect, it } from 'vitest';

import { COLLECTIONS } from '../server/scope.js';

interface SchemaClient {
  readonly schema: { hasTable(name: string): Promise<boolean> };
  raw(sql: string): Promise<readonly { readonly sql: string | null }[]>;
}

/** The physical name the default naming strategy gives a collection. */
function table(collection: string): string {
  return collection.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

it('creates every collection on up and removes every one on down', async () => {
  const database = createDatabaseManager({
    default: 'main',
    drivers: { sqlite },
    connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
  });
  try {
    const migrator = database.createMigrator({
      connection: 'main',
      directory: path.resolve(import.meta.dirname, '../database/migrations'),
      packageName: '@nocobase/app-plugin-office-flows-example',
    });
    await migrator.latest();
    const connection = database.connection('main');
    const client = await connection.client<SchemaClient>();
    const names = Object.values(COLLECTIONS);
    expect(names).toHaveLength(16);
    for (const name of names) {
      expect(await client.schema.hasTable(table(name))).toBe(true);
      expect(await connection.collectionMetadata.get(name)).toBeDefined();
    }
    // Every lifecycle record carries its version; the log and the traces
    // are unique where a retry must not write twice.
    const indexes = (
      await client.raw(
        "select sql from sqlite_master where type = 'index' and sql like '%UNIQUE%'",
      )
    )
      .map((row) => row.sql ?? '')
      .join('\n');
    expect(indexes).toMatch(
      /office_flows_transitions.*lifecycle.*record_id.*version/,
    );
    expect(indexes).toMatch(/office_flows_traces.*key/);
    // The request key is unique only where there is one.
    expect(indexes).toMatch(
      /office_flows_transitions.*request_id[^\n]*where[^\n]*request_id[^\n]*is not null/i,
    );

    await migrator.rollback();
    for (const name of names) {
      expect(await client.schema.hasTable(table(name))).toBe(false);
      expect(await connection.collectionMetadata.get(name)).toBeUndefined();
    }
  } finally {
    await database.destroy();
  }
});
