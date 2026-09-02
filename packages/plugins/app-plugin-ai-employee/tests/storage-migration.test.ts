import { afterEach, describe, expect, it } from 'vitest';
import {
  createDatabaseManager,
  InMemoryCollectionMetadataStore,
  type DatabaseManager,
} from '@nocobase/db';

import createMigration from '../database/migrations/202608260002_create_ai_employee.js';
import storageMigration from '../database/migrations/202608310001_replace_ai_file_storage_id_with_disk.js';

interface SqliteClient {
  readonly schema: {
    hasColumn(table: string, column: string): Promise<boolean>;
  };
}

const managers: DatabaseManager[] = [];

afterEach(async () => {
  await Promise.all(managers.splice(0).map((database) => database.destroy()));
});

describe('AI file storage migration', () => {
  it('replaces storageId with disk and reverses the change', async () => {
    const database = createDatabaseManager({
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
    await storageMigration.up(context);

    const client = await database.connection().client<SqliteClient>();
    await expect(client.schema.hasColumn('ai_files', 'disk')).resolves.toBe(
      true,
    );
    await expect(
      client.schema.hasColumn('ai_files', 'storage_id'),
    ).resolves.toBe(false);

    await storageMigration.down?.(context);
    await expect(
      client.schema.hasColumn('ai_files', 'storage_id'),
    ).resolves.toBe(true);
    await expect(client.schema.hasColumn('ai_files', 'disk')).resolves.toBe(
      false,
    );
  });
});
