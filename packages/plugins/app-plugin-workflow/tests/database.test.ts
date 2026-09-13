import sqlite from '@nocobase/db-sqlite';
import { fileURLToPath } from 'node:url';

import {
  createDatabaseManager,
  validateMigrations,
  validateSeeds,
} from '@nocobase/db';
import { describe, expect, it } from 'vitest';

import { workflowStore } from '../server/collections/store.js';

const migrationsDirectory = fileURLToPath(
  new URL('../database/migrations', import.meta.url),
);
const seedsDirectory = fileURLToPath(
  new URL('../database/seeds', import.meta.url),
);
const createMigrationName = '202608200001_create_workflow_collections';
const instantMigrationName = '202609110001_workflow_instant_columns';
const migrationNames = [createMigrationName, instantMigrationName];
/** Columns that hold an instant and therefore must resolve as `datetimeTz`. */
const instantFields = {
  workflowRuns: ['startedAt', 'finishedAt', 'expiresAt', 'createdAt'],
  workflowNodeRuns: ['startedAt', 'finishedAt', 'expiresAt'],
} as const;
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
    expect(migrations.map((migration) => migration.name)).toEqual(
      migrationNames,
    );
    await expect(validateSeeds(seedsDirectory)).resolves.toEqual([]);
  });

  it('creates and drops the fixed workflow schema', async () => {
    const database = createDatabaseManager({
      drivers: { sqlite },
      default: 'main',
      connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
    });

    try {
      const migrator = database.createMigrator({
        directory: migrationsDirectory,
        packageName: '@nocobase/app-plugin-workflow',
      });

      // Applied as two batches so the rollback below reaches exactly the
      // instant migration, which is the reversible half being verified.
      await expect(migrator.upTo(createMigrationName)).resolves.toMatchObject({
        executed: [createMigrationName],
        skipped: [],
      });
      // A row written the way the engine used to write one: the UTC wall
      // clock, with nothing recording that it is UTC. Converting the column
      // has to read it back as the same instant, whatever time zone the
      // database server happens to be configured with.
      const legacy = '2026-08-24T01:18:19.007Z';
      // Written through the query builder on purpose: before the columns were
      // `datetimeTz` this is the shape the engine stored, and the migration has
      // to read it back as the same instant.
      await database
        .query()
        .insertInto('workflowRuns')
        .values({
          workflowId: 1,
          workflowKey: 'legacy',
          eventKey: 'legacy',
          input: JSON.stringify({}),
          parameters: JSON.stringify({}),
          stack: JSON.stringify([]),
          output: JSON.stringify(null),
          dispatched: false,
          manually: false,
          createdAt: legacy,
        })
        .execute();

      await expect(migrator.latest()).resolves.toMatchObject({
        executed: [instantMigrationName],
        skipped: [createMigrationName],
      });
      const connection = database.connection();
      const migrated = await workflowStore(database).runs.findOne({
        filter: { eventKey: 'legacy' },
        select: (select) => select.fields('createdAt'),
      });
      expect(migrated?.createdAt).toBe(legacy);
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

      // Every run timestamp is an instant. Declared zone-free, PostgreSQL
      // stored it without its offset and its driver rebuilt it in the host's
      // zone, which is what made a finished node look eight hours long.
      for (const [name, fields] of Object.entries(instantFields)) {
        const collection = await connection.collections.get(name);
        expect(
          fields.map(
            (field) =>
              collection?.fields?.find((one) => one.name === field)?.type,
          ),
        ).toEqual(fields.map(() => 'datetimeTz'));
      }

      await expect(migrator.rollback()).resolves.toMatchObject({
        rolledBack: [instantMigrationName],
      });
      for (const [name, fields] of Object.entries(instantFields)) {
        const rolledBack = await connection.collections.get(name);
        expect(
          fields.map(
            (field) =>
              rolledBack?.fields?.find((one) => one.name === field)?.type,
          ),
        ).toEqual(fields.map(() => 'datetime'));
      }
      await expect(migrator.rollback()).resolves.toMatchObject({
        rolledBack: [createMigrationName],
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
