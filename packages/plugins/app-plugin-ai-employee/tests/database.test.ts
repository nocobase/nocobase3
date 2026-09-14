import sqlite from '@nocobase/db-sqlite';
import { createDatabaseManager, type DatabaseManager } from '@nocobase/db';
import { afterEach, describe, expect, it } from 'vitest';

import createMigration from '../database/migrations/202608260002_create_ai_employee.js';

interface SqliteClient {
  readonly schema: {
    hasTable(table: string): Promise<boolean>;
    hasColumn(table: string, column: string): Promise<boolean>;
  };
}

const COLLECTIONS = [
  ['aiEmployees', 'ai_employees'],
  ['aiMcpClients', 'ai_mcp_clients'],
  ['llmServices', 'llm_services'],
  ['aiConversations', 'ai_conversations'],
  ['aiMessages', 'ai_messages'],
  ['aiToolMessages', 'ai_tool_messages'],
  ['aiFiles', 'ai_files'],
  ['aiSettings', 'ai_settings'],
  ['aiUsageEvents', 'ai_usage_events'],
  ['usersAiEmployees', 'users_ai_employees'],
  ['lcCheckpoints', 'lc_checkpoints'],
  ['lcCheckpointBlobs', 'lc_checkpoint_blobs'],
  ['lcCheckpointWrites', 'lc_checkpoint_writes'],
] as const;

const databases: DatabaseManager[] = [];

async function createDatabase() {
  const database = createDatabaseManager({
    drivers: { sqlite },
    default: 'main',
    connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
  });
  databases.push(database);
  await database.connect();
  return database;
}

afterEach(async () => {
  await Promise.all(databases.splice(0).map((database) => database.destroy()));
});

describe('@nocobase/app-plugin-ai-employee database', () => {
  it('creates the complete AI employee schema in a real database', async () => {
    const database = await createDatabase();
    const context = {
      builder: database.builder(),
      query: database.connection().query,
      connection: database.connection(),
    };

    await createMigration.up(context);
    const client = await database.connection().client<SqliteClient>();

    await expect(
      Promise.all(
        COLLECTIONS.map(([, table]) => client.schema.hasTable(table)),
      ),
    ).resolves.toEqual(COLLECTIONS.map(() => true));
    await expect(
      Promise.all([
        client.schema.hasColumn('ai_employees', 'username'),
        client.schema.hasColumn('ai_employees', 'skill_settings'),
        client.schema.hasColumn('ai_employees', 'enabled'),
        client.schema.hasColumn('ai_conversations', 'session_id'),
        client.schema.hasColumn('ai_messages', 'message_id'),
        client.schema.hasColumn('ai_files', 'storage_id'),
        client.schema.hasColumn('lc_checkpoint_blobs', 'blob'),
      ]),
    ).resolves.toEqual([true, true, true, true, true, true, true]);

    // Every collection uses IF NOT EXISTS, so re-running the migration is safe.
    await expect(createMigration.up(context)).resolves.toBeUndefined();
  });

  it('drops every collection on rollback in dependency-safe order', async () => {
    const database = await createDatabase();
    const context = {
      builder: database.builder(),
      query: database.connection().query,
      connection: database.connection(),
    };

    await createMigration.up(context);
    await createMigration.down?.(context);
    const client = await database.connection().client<SqliteClient>();

    await expect(
      Promise.all(
        COLLECTIONS.map(([, table]) => client.schema.hasTable(table)),
      ),
    ).resolves.toEqual(COLLECTIONS.map(() => false));
  });
});
