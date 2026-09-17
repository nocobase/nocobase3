import { fileURLToPath } from 'node:url';

import {
  createDatabaseManager,
  InMemoryCollectionMetadataStore,
  type DatabaseManager,
  validateMigrations,
  validateSeeds,
} from '@nocobase/db';
import sqlite from '@nocobase/db-sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import migration from '../database/migrations/202609020001_scheduler_create_definitions.js';

interface SqliteClient {
  readonly schema: { hasTable(name: string): Promise<boolean> };
  raw(sql: string): Promise<readonly Record<string, unknown>[]>;
}

const TABLES = [
  'schedule_sync_locks',
  'schedule_definitions',
  'schedule_occurrences',
] as const;

describe('@nocobase/app-plugin-scheduler database', () => {
  let database: DatabaseManager;
  let metadataStore: InMemoryCollectionMetadataStore;

  beforeEach(() => {
    metadataStore = new InMemoryCollectionMetadataStore();
    database = createDatabaseManager({
      drivers: { sqlite },
      default: 'main',
      metadataStore,
      connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
    });
  });

  afterEach(async () => database.destroy());

  it('provides the scheduler schema migration and no seeds', async () => {
    const migrationsDirectory = fileURLToPath(
      new URL('../database/migrations', import.meta.url),
    );
    const seedsDirectory = fileURLToPath(
      new URL('../database/seeds', import.meta.url),
    );

    await expect(validateMigrations(migrationsDirectory)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: '202609020001_scheduler_create_definitions',
        }),
      ]),
    );
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
    await expect(client.schema.hasTable('queue_jobs')).resolves.toBe(false);
    await expect(client.schema.hasTable('queue_schedules')).resolves.toBe(
      false,
    );
    await expect(metadataStore.get('queueSchedules')).resolves.toBeUndefined();
    await expect(metadataStore.get('queueJobs')).resolves.toBeUndefined();
    for (const [name, fields] of Object.entries({
      scheduleSyncLocks: ['createdAt', 'updatedAt'],
      scheduleDefinitions: [
        'fromDate',
        'toDate',
        'deactivatedAt',
        'createdAt',
        'updatedAt',
      ],
      scheduleOccurrences: [
        'startedAt',
        'lastStartedAt',
        'acceptedAt',
        'lastObservedAt',
        'observationDeadlineAt',
        'finishedAt',
        'createdAt',
        'updatedAt',
      ],
    })) {
      await expect(metadataStore.get(name)).resolves.toMatchObject({
        document: {
          fields: Object.fromEntries(
            fields.map((field) => [field, { type: 'datetimeTz' }]),
          ),
        },
      });
    }
    const instant = '2026-09-17T08:00:00.123+08:00';
    const locks = database.connection().repository('scheduleSyncLocks');
    await locks.createOne({
      values: {
        appName: 'timezone-test',
        createdAt: instant,
        updatedAt: instant,
      },
    });
    await expect(
      locks.findOne({ filter: { appName: 'timezone-test' } }),
    ).resolves.toMatchObject({
      createdAt: '2026-09-17T00:00:00.123Z',
      updatedAt: '2026-09-17T00:00:00.123Z',
    });
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
      client.raw('PRAGMA index_list(schedule_occurrences)'),
    ).resolves.toEqual(expect.arrayContaining([expect.objectContaining({})]));
    await expect(
      metadataStore
        .get('scheduleOccurrences')
        .then((stored) => stored?.document),
    ).resolves.toMatchObject({
      fields: {
        executionCount: { type: 'integer' },
        targetReferenceType: { type: 'string' },
        targetReferenceId: { type: 'string' },
        resultSummary: { type: 'json' },
      },
      relations: {
        schedule: { target: 'scheduleDefinitions' },
      },
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
      await expect(metadataStore.get(collection)).resolves.toBeUndefined();
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
