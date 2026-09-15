// @vitest-environment node

import { createDatabaseManager } from '@nocobase/db';
import sqlite from '@nocobase/db-sqlite';
import type { Knex } from 'knex';
import { afterEach, describe, expect, it } from 'vitest';

import createApiKeyTable from '../database/migrations/202609150001_create_api_key_table.js';
import { API_KEY_TABLE_NAME } from '@better-auth/api-key';

import { apiKey } from '../server/api-keys.js';

/** Mirrors the database package's default column naming. */
function columnName(field: string): string {
  return field.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
}

describe('the apikey table', () => {
  const databases: ReturnType<typeof createDatabaseManager>[] = [];

  afterEach(async () => {
    await Promise.all(
      databases.splice(0).map((database) => database.destroy()),
    );
  });

  async function migrate() {
    const database = createDatabaseManager({
      drivers: { sqlite },
      default: 'main',
      connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
    });
    databases.push(database);
    const connection = database.connection();
    const context = {
      builder: connection.builder,
      query: connection.query,
      connection,
    };
    await createApiKeyTable.up(context);
    return { context, client: await connection.client<Knex>() };
  }

  it('carries a column for every field the Better Auth plugin declares', async () => {
    const { client } = await migrate();
    const fields = Object.keys(
      apiKey().schema?.[API_KEY_TABLE_NAME]?.fields ?? {},
    ).concat('id');

    expect(fields.length).toBeGreaterThan(1);
    for (const field of fields) {
      await expect(
        client.schema.hasColumn(API_KEY_TABLE_NAME, columnName(field)),
      ).resolves.toBe(true);
    }
  });

  it('accepts and returns a row the way the plugin writes one', async () => {
    const { context, client } = await migrate();
    const now = new Date();

    await client('apikey').insert({
      id: 'key-1',
      config_id: 'default',
      name: 'nightly-export',
      start: 'nb_abc',
      prefix: 'nb_',
      key: 'a-hashed-value',
      reference_id: 'user-1',
      created_at: now,
      updated_at: now,
    });

    const [row] = await client('apikey').select('*');

    expect(row).toMatchObject({
      id: 'key-1',
      name: 'nightly-export',
      reference_id: 'user-1',
      request_count: 0,
    });
    // SQLite has no boolean type; both dialects agree on the value, not the type.
    expect(Boolean(row.enabled)).toBe(true);

    await createApiKeyTable.down?.(context);
    await expect(client.schema.hasTable('apikey')).resolves.toBe(false);
  });
});
