import sqlite from '@nocobase/db-sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createDatabaseManager,
  InMemoryCollectionMetadataStore,
  type DatabaseManager,
} from '@nocobase/db';

import createMigration from '../database/migrations/202608260002_create_ai_employee.js';
import toolPermissionsMigration from '../database/migrations/202609230001_add_ai_mcp_tool_permissions.js';

interface SqliteClient {
  readonly schema: {
    hasColumn(table: string, column: string): Promise<boolean>;
  };
}

const managers: DatabaseManager[] = [];

afterEach(async () => {
  await Promise.all(managers.splice(0).map((database) => database.destroy()));
});

describe('MCP tool permissions migration', () => {
  it('adds toolPermissions to aiMcpClients and reverses the change', async () => {
    const database = createDatabaseManager({
      drivers: { sqlite },
      default: 'main',
      metadataStore: new InMemoryCollectionMetadataStore(),
      connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
    });
    managers.push(database);
    await database.connect();
    const context = {
      builder: database.builder(),
      query: database.connection().query,
      connection: database.connection(),
    };
    await createMigration.up(context);
    const client = await database.connection().client<SqliteClient>();

    await toolPermissionsMigration.up(context);
    await expect(
      client.schema.hasColumn('ai_mcp_clients', 'tool_permissions'),
    ).resolves.toBe(true);
    await database.repository('aiMcpClients').createOne({
      values: {
        name: 'search',
        transport: 'http',
        toolPermissions: { lookup: 'ALLOW' },
      },
    });
    await expect(
      database
        .repository('aiMcpClients')
        .findOne({ filter: { name: 'search' } }),
    ).resolves.toMatchObject({ toolPermissions: { lookup: 'ALLOW' } });

    await toolPermissionsMigration.down?.(context);
    await expect(
      client.schema.hasColumn('ai_mcp_clients', 'tool_permissions'),
    ).resolves.toBe(false);
  });
});
