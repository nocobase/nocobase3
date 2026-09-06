import { fileURLToPath } from 'node:url';

import {
  createDatabaseManager,
  InMemoryCollectionMetadataStore,
  type DatabaseManager,
  validateMigrations,
  validateSeeds,
} from '@nocobase/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import migration from '../database/migrations/202609020001_scheduler_create_definitions.js';

interface SqliteClient {
  readonly schema: { hasTable(name: string): Promise<boolean> };
  raw(sql: string): Promise<readonly Record<string, unknown>[]>;
}

const TABLES = [
  'schedule_sync_locks',
  'schedule_definitions',
  'queue_jobs',
  'queue_schedules',
  'schedule_occurrences',
] as const;

describe('@nocobase/app-plugin-scheduler database', () => {
  let database: DatabaseManager;
  let metadataStore: InMemoryCollectionMetadataStore;

  beforeEach(() => {
    metadataStore = new InMemoryCollectionMetadataStore();
    database = createDatabaseManager({
      default: 'main',
      metadataStore,
      connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
    });
  });

  afterEach(async () => database.destroy());

  it('provides one self-contained migration and no seeds', async () => {
    const migrationsDirectory = fileURLToPath(
      new URL('../database/migrations', import.meta.url),
    );
    const seedsDirectory = fileURLToPath(
      new URL('../database/seeds', import.meta.url),
    );

    await expect(
      validateMigrations(migrationsDirectory),
    ).resolves.toMatchObject([
      { name: '202609020001_scheduler_create_definitions' },
    ]);
    await expect(validateSeeds(seedsDirectory)).resolves.toEqual([]);
  });

  it('creates the physical schema, indexes, foreign key, and metadata', async () => {
    await migrateUp(database);
    const client = await database.connection().client<SqliteClient>();

    await expect(
      Promise.all(TABLES.map((table) => client.schema.hasTable(table))),
    ).resolves.toEqual(TABLES.map(() => true));
    await expect(
      client.raw('PRAGMA index_list(schedule_definitions)'),
    ).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ unique: 1 })]),
    );
    await expect(
      client.raw('PRAGMA index_list(queue_schedules)'),
    ).resolves.toEqual(expect.arrayContaining([expect.objectContaining({})]));
    await expect(client.raw('PRAGMA table_info(queue_jobs)')).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'id', notnull: 1, pk: 1 }),
        expect.objectContaining({ name: 'queue', notnull: 1, pk: 2 }),
        expect.objectContaining({ name: 'status', notnull: 1 }),
        expect.objectContaining({ name: 'data', notnull: 1 }),
        expect.objectContaining({ name: 'dedup_id' }),
        expect.objectContaining({ name: 'dedup_at' }),
        expect.objectContaining({ name: 'dedup_ttl' }),
      ]),
    );
    await expect(client.raw('PRAGMA index_list(queue_jobs)')).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'queue_jobs_status_score_idx' }),
        expect.objectContaining({ name: 'queue_jobs_status_execute_idx' }),
        expect.objectContaining({ name: 'queue_jobs_status_finished_idx' }),
        expect.objectContaining({ name: 'queue_jobs_queue_dedup_idx' }),
        expect.objectContaining({
          name: 'queue_jobs_dedup_active_uidx',
          unique: 1,
          partial: 1,
        }),
      ]),
    );
    await expect(
      client.raw('PRAGMA foreign_key_list(schedule_occurrences)'),
    ).resolves.toEqual([
      expect.objectContaining({
        table: 'schedule_definitions',
        from: 'schedule_id',
        to: 'id',
        on_delete: 'RESTRICT',
      }),
    ]);
    await expect(
      metadataStore.getCollection('scheduleOccurrences'),
    ).resolves.toMatchObject({
      fields: expect.arrayContaining([
        expect.objectContaining({ name: 'schedule' }),
        expect.objectContaining({ name: 'executionCount' }),
      ]),
    });
  });

  it('drops schema and metadata in reverse dependency order', async () => {
    await migrateUp(database);
    await migrateDown(database);
    const client = await database.connection().client<SqliteClient>();
    await expect(
      Promise.all(TABLES.map((table) => client.schema.hasTable(table))),
    ).resolves.toEqual(TABLES.map(() => false));
    for (const collection of [
      'scheduleSyncLocks',
      'scheduleDefinitions',
      'queueJobs',
      'queueSchedules',
      'scheduleOccurrences',
    ]) {
      await expect(
        metadataStore.getCollection(collection),
      ).resolves.toBeUndefined();
    }
  });
});

async function migrateUp(database: DatabaseManager): Promise<void> {
  const connection = database.connection();
  await migration.up({
    builder: connection.builder,
    query: connection.query,
    connection,
  });
}

async function migrateDown(database: DatabaseManager): Promise<void> {
  const connection = database.connection();
  await migration.down?.({
    builder: connection.builder,
    query: connection.query,
    connection,
  });
}
