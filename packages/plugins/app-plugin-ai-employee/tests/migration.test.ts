import { fileURLToPath } from 'node:url';

import {
  loadMigrations,
  validateMigrations,
  type CollectionBuilder,
} from '@nocobase/db';
import { describe, expect, it } from 'vitest';

const directory = fileURLToPath(
  new URL('../database/migrations', import.meta.url),
);
const migrationName = '202608260002_create_ai_employee';
const migrationFileName = `${migrationName}.ts`;
const storageMigrationName =
  '202608310001_replace_ai_file_storage_id_with_disk';
const collectionNames = [
  'aiEmployees',
  'aiMcpClients',
  'llmServices',
  'aiConversations',
  'aiMessages',
  'aiToolMessages',
  'aiFiles',
  'aiSettings',
  'aiUsageEvents',
  'usersAiEmployees',
  'lcCheckpoints',
  'lcCheckpointBlobs',
  'lcCheckpointWrites',
] as const;

async function loadAIEmployeeMigration() {
  const [migration] = await loadMigrations({
    packageName: '@nocobase/app-plugin-ai-employee',
    directory,
  });
  return migration;
}

describe('AI employee migration', () => {
  it('is discoverable and conforms to the migration contract', async () => {
    const migrations = await validateMigrations({
      packageName: '@nocobase/app-plugin-ai-employee',
      directory,
    });

    expect(migrations).toHaveLength(2);
    expect(migrations[0]).toMatchObject({
      packageName: '@nocobase/app-plugin-ai-employee',
      fileName: migrationFileName,
      name: migrationName,
    });
    expect(migrations[1]).toMatchObject({
      packageName: '@nocobase/app-plugin-ai-employee',
      fileName: `${storageMigrationName}.ts`,
      name: storageMigrationName,
    });
    expect(migrations[1].migration.down).toEqual(expect.any(Function));
  });

  it('creates all AI employee collections and drops them in reverse dependency order', async () => {
    const migration = await loadAIEmployeeMigration();
    const created: string[] = [];
    const dropped: string[] = [];
    const builder = {
      createCollection: async (name: string): Promise<void> => {
        created.push(name);
      },
      dropCollection: async (name: string): Promise<void> => {
        dropped.push(name);
      },
    } as unknown as CollectionBuilder;

    await migration.migration.up({
      builder,
      query: undefined!,
      connection: undefined!,
    });
    await migration.migration.down?.({
      builder,
      query: undefined!,
      connection: undefined!,
    });

    expect(created).toEqual(collectionNames);
    expect(dropped).toEqual([...collectionNames].reverse());
  });
});
