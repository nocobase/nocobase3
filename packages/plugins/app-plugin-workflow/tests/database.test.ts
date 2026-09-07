import { fileURLToPath } from 'node:url';

import {
  createDatabaseManager,
  validateMigrations,
  validateSeeds,
} from '@nocobase/db';
import { describe, expect, it } from 'vitest';

const migrationsDirectory = fileURLToPath(
  new URL('../database/migrations', import.meta.url),
);
const seedsDirectory = fileURLToPath(
  new URL('../database/seeds', import.meta.url),
);
const migrationName = '202608200001_create_workflow_collections';
const collectionNames = [
  'workflows',
  'workflowNodes',
  'workflowRuns',
  'workflowNodeRuns',
  'workflowStats',
  'workflowVersionStats',
] as const;

describe('@nocobase/app-plugin-workflow database', () => {
  it('provides the workflow collections migration and no seeds', async () => {
    const migrations = await validateMigrations(migrationsDirectory);
    expect(migrations.map((migration) => migration.name)).toEqual([
      migrationName,
    ]);
    await expect(validateSeeds(seedsDirectory)).resolves.toEqual([]);
  });

  it('creates and drops the fixed workflow schema', async () => {
    const database = createDatabaseManager({
      default: 'main',
      connections: {
        main: {
          dialect: 'sqlite',
          filename: ':memory:',
        },
      },
    });

    try {
      const migrator = database.createMigrator({
        directory: migrationsDirectory,
        packageName: '@nocobase/app-plugin-workflow',
      });

      await expect(migrator.latest()).resolves.toMatchObject({
        executed: [migrationName],
        skipped: [],
      });
      const connection = database.connection();
      await expect(
        Promise.all(
          collectionNames.map((name) => connection.builder.hasCollection(name)),
        ),
      ).resolves.toEqual(collectionNames.map(() => true));
      const collections = await Promise.all(
        collectionNames.map((name) => connection.collections.get(name)),
      );
      expect(collections.map((collection) => collection?.name)).toEqual(
        collectionNames,
      );
      expect(collections[0]?.fields).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'id', autoIncrement: true }),
          expect.objectContaining({
            name: 'nodes',
            type: 'hasMany',
            target: 'workflowNodes',
          }),
        ]),
      );
      expect(collections[3]?.fields).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'workflowRunId',
            nullable: false,
          }),
          expect.objectContaining({
            name: 'workflowRun',
            type: 'belongsTo',
            target: 'workflowRuns',
          }),
        ]),
      );

      await expect(migrator.rollback()).resolves.toMatchObject({
        rolledBack: [migrationName],
      });
      await expect(
        Promise.all(
          collectionNames.map((name) => connection.builder.hasCollection(name)),
        ),
      ).resolves.toEqual(collectionNames.map(() => false));
    } finally {
      await database.destroy();
    }
  });
});
