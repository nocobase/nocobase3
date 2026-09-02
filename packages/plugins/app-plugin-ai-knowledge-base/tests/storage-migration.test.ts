import { afterEach, describe, expect, it } from 'vitest';
import {
  createDatabaseManager,
  InMemoryCollectionMetadataStore,
  type DatabaseManager,
} from '@nocobase/db';

import createMigration from '../database/migrations/202608260001_create_ai_knowledge_base.js';
import storageMigration from '../database/migrations/202609010001_replace_knowledge_base_storage_id_with_disk.js';

interface SqliteClient {
  readonly schema: {
    hasColumn(table: string, column: string): Promise<boolean>;
  };
}

const managers: DatabaseManager[] = [];

async function createDatabase(): Promise<DatabaseManager> {
  const database = createDatabaseManager({
    default: 'main',
    metadataStore: new InMemoryCollectionMetadataStore(),
    connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
  });
  managers.push(database);
  await database.connect();
  return database;
}

afterEach(async () => {
  await Promise.all(managers.splice(0).map((database) => database.destroy()));
});

describe('knowledge base storage migration', () => {
  it('replaces storageId with disk and adds shard extname', async () => {
    const database = await createDatabase();
    const context = {
      builder: database.builder(),
      query: database.connection().query,
      connection: database.connection(),
    };
    await createMigration.up(context);
    await storageMigration.up(context);

    const client = await database.connection().client<SqliteClient>();
    for (const table of [
      'ai_knowledge_base',
      'ai_knowledge_base_docs',
      'ai_knowledge_base_doc_segment_shards',
    ]) {
      await expect(client.schema.hasColumn(table, 'disk')).resolves.toBe(true);
      await expect(client.schema.hasColumn(table, 'storage_id')).resolves.toBe(
        false,
      );
    }
    await expect(
      client.schema.hasColumn(
        'ai_knowledge_base_doc_segment_shards',
        'extname',
      ),
    ).resolves.toBe(true);

    await storageMigration.down?.(context);
    await expect(
      client.schema.hasColumn('ai_knowledge_base', 'storage_id'),
    ).resolves.toBe(true);
    await expect(
      client.schema.hasColumn('ai_knowledge_base', 'disk'),
    ).resolves.toBe(false);
  });
});
