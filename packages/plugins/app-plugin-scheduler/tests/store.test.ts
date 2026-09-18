import { queueMigrationSource } from '@nocobase/queue';
import {
  createDatabaseManager,
  type DatabaseManager,
  type Row,
} from '@nocobase/db';
import sqlite from '@nocobase/db-sqlite';
import { createQueueManager, type NocoBaseQueueManager } from '@nocobase/queue';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import migration from '../database/migrations/202609020001_scheduler_create_definitions.js';
import {
  defineSchedule,
  type ScheduleDefinition,
} from '../server/schedules/define.js';
import { ScheduleStore, scheduleId } from '../server/store.js';

const NOW = new Date('2026-03-08T06:30:00.000Z');

describe('ScheduleStore reconciliation', () => {
  let database: DatabaseManager;
  let queue: NocoBaseQueueManager;
  let store: ScheduleStore;

  beforeEach(async () => {
    database = createDatabaseManager({
      drivers: { sqlite },
      connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
    });
    const connection = database.connection();
    await database
      .createMigrator({
        sources: [
          {
            ...queueMigrationSource,
            parameters: {
              jobsTable: 'queue_jobs',
              schedulesTable: 'queue_schedules',
            },
            configuration: [{ driver: 'database' }],
          },
        ],
      })
      .latest();
    await migration.up({
      builder: connection.builder,
      query: connection.query,
      connection,
    });
    queue = createQueueManager(
      {
        default: 'database',
        connections: {
          database: {
            driver: 'database',
            table: 'queue_jobs',
            schedulesTable: 'queue_schedules',
          },
        },
        queues: { schedule: { connection: 'database' } },
        jobs: { autoLoad: false, locations: [] },
      },
      { database },
    );
    await queue.init();
    store = new ScheduleStore(
      database,
      'main',
      queue.schedules('schedule'),
      () => new Date(NOW),
    );
  });

  afterEach(async () => {
    await queue.close();
    await database.destroy();
  });

  it('creates stable one-to-one product and Queue projections', async () => {
    await store.reconcile([entry(baseDefinition())]);
    await store.reconcile([entry(baseDefinition())]);
    const id = scheduleId('main', 'daily');
    await expect(rows('schedule_definitions')).resolves.toHaveLength(1);
    await expect(queue.schedules('schedule').list()).resolves.toMatchObject([
      {
        id,
        name: 'ScheduleDispatchJob',
        status: 'active',
        runCount: 0,
        lastRunAt: null,
        nextRunAt: new Date('2026-03-09T00:00:00.000Z'),
      },
    ]);
  });

  it('reuses the app lock and keeps different apps isolated', async () => {
    await store.reconcile([]);
    await store.reconcile([], true);
    const otherStore = new ScheduleStore(
      database,
      'other',
      queue.schedules('schedule'),
      () => new Date(NOW),
    );
    await otherStore.reconcile([]);

    expect(await rows('schedule_sync_locks')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ appName: 'main' }),
        expect.objectContaining({ appName: 'other' }),
      ]),
    );
    await expect(rows('schedule_sync_locks')).resolves.toHaveLength(2);
  });

  it('preserves Queue counters, next time, and the enabled state for unchanged and content-only updates', async () => {
    await store.reconcile([entry(baseDefinition())]);
    const id = scheduleId('main', 'daily');
    await queue.schedules('schedule').update(id, {
      runCount: 9,
      lastRunAt: new Date('2026-03-07T00:00:00.000Z'),
      nextRunAt: new Date('2026-03-10T00:00:00.000Z'),
    });
    // `enabled` is owned by the database rather than by the code definition, so
    // reconciling a redeployed manifest must not undo an administrator's pause.
    await store.setEnabled(id, false);

    await store.reconcile([entry(baseDefinition({ title: 'Renamed' }))]);
    await expect(queueRow(id)).resolves.toMatchObject({
      status: 'paused',
      runCount: 9,
      lastRunAt: new Date('2026-03-07T00:00:00.000Z'),
      nextRunAt: new Date('2026-03-10T00:00:00.000Z'),
    });
  });

  it('recalculates schedule fields without resetting history counters', async () => {
    await store.reconcile([entry(baseDefinition())]);
    const id = scheduleId('main', 'daily');
    await database
      .query()
      .updateTable('queue_schedules')
      .set({ runCount: 4 })
      .where('id', '=', id)
      .execute();

    await store.reconcile([
      entry(
        baseDefinition({ schedule: { cron: '0 0 12 * * *', timezone: 'UTC' } }),
      ),
    ]);
    await expect(queueRow(id)).resolves.toMatchObject({
      runCount: 4,
      nextRunAt: new Date('2026-03-08T12:00:00.000Z'),
    });
  });

  it('only finalize deactivates missing code definitions and reactivation preserves identity and history', async () => {
    await store.reconcile([entry(baseDefinition())]);
    const id = scheduleId('main', 'daily');
    await database
      .query()
      .updateTable('queue_schedules')
      .set({ runCount: 3 })
      .where('id', '=', id)
      .execute();

    await store.reconcile([], false);
    expect((await store.list())[0]?.lifecycleState).toBe('active');
    await store.reconcile([], true);
    expect((await store.list())[0]).toMatchObject({
      id,
      lifecycleState: 'inactive',
      inactiveReason: 'definition_removed',
      scheduleStatus: 'paused',
      runCount: 3,
    });
    await store.reconcile([entry(baseDefinition())]);
    expect((await store.list())[0]).toMatchObject({
      id,
      lifecycleState: 'active',
      scheduleStatus: 'active',
      runCount: 3,
      nextRunAt: '2026-03-09T00:00:00.000Z',
    });
  });

  it('counts only succeeded occurrences as completed', async () => {
    await store.reconcile([
      entry(baseDefinition()),
      entry(baseDefinition({ key: 'weekly', title: 'Weekly' })),
    ]);
    const daily = scheduleId('main', 'daily');
    const weekly = scheduleId('main', 'weekly');
    await insertOccurrences(daily, [
      'succeeded',
      'succeeded',
      'failed',
      'timed_out',
      'cancelled',
      'triggered',
      'skipped',
    ]);
    await insertOccurrences(weekly, ['succeeded', 'running']);

    const byKey = new Map(
      (await store.list()).map((record) => [record.key, record]),
    );
    expect(byKey.get('daily')?.completedCount).toBe(2);
    expect(byKey.get('weekly')?.completedCount).toBe(1);
  });

  it('reports zero completed for a schedule with no occurrences', async () => {
    await store.reconcile([entry(baseDefinition())]);
    expect((await store.list())[0]?.completedCount).toBe(0);
  });

  it('scopes completed counts to the app that owns the definitions', async () => {
    const otherStore = new ScheduleStore(
      database,
      'other',
      queue.schedules('schedule'),
      () => new Date(NOW),
    );
    await store.reconcile([entry(baseDefinition())]);
    await otherStore.reconcile([entry(baseDefinition())]);
    await insertOccurrences(scheduleId('main', 'daily'), ['succeeded']);
    await insertOccurrences(scheduleId('other', 'daily'), [
      'succeeded',
      'succeeded',
    ]);

    expect((await store.list())[0]?.completedCount).toBe(1);
    expect((await otherStore.list())[0]?.completedCount).toBe(2);
  });

  it('records a retryable synchronization failure when a projection write fails', async () => {
    const client = await database.connection().client();
    await client.raw(`
      CREATE TRIGGER reject_queue_schedule
      BEFORE INSERT ON queue_schedules
      BEGIN
        SELECT RAISE(FAIL, 'projection rejected');
      END
    `);

    await expect(
      store.reconcile([entry(baseDefinition())], true),
    ).rejects.toThrow('projection rejected');
    await expect(rows('schedule_definitions')).resolves.toMatchObject([
      {
        syncStatus: 'failed',
        syncError: expect.stringContaining('projection rejected'),
      },
    ]);
    await expect(rows('queue_schedules')).resolves.toEqual([]);
    await expect(rows('schedule_sync_locks')).resolves.toHaveLength(1);

    await client.raw('DROP TRIGGER reject_queue_schedule');
    await store.reconcile([entry(baseDefinition())], true);
    await expect(rows('schedule_definitions')).resolves.toMatchObject([
      { syncStatus: 'synced', syncError: null },
    ]);
    await expect(rows('queue_schedules')).resolves.toHaveLength(1);
  });

  it('projects schedules through a non-database queue connection', async () => {
    await queue.close();
    queue = createQueueManager({
      default: 'sync',
      connections: {
        sync: { driver: 'sync' },
        memory: { driver: 'fake' },
      },
      queues: { schedule: { connection: 'memory' } },
      jobs: { autoLoad: false, locations: [] },
    });
    await queue.init();
    const schedules = queue.schedules('schedule');
    store = new ScheduleStore(database, 'main', schedules, () => new Date(NOW));

    await store.reconcile([entry(baseDefinition())]);

    await expect(rows('queue_schedules')).resolves.toEqual([]);
    await expect(
      schedules.get(scheduleId('main', 'daily')),
    ).resolves.toMatchObject({
      name: 'ScheduleDispatchJob',
      status: 'active',
    });
  });

  it('supports five/six fields, inclusive bounds, UTC, and an IANA DST transition', async () => {
    const definitions = [
      baseDefinition({
        key: 'five',
        schedule: { cron: '0 7 * * *', timezone: 'UTC' },
      }),
      baseDefinition({
        key: 'six',
        schedule: { cron: '30 0 7 * * *', timezone: 'UTC' },
      }),
      baseDefinition({
        key: 'from',
        schedule: {
          cron: '0 0 7 * * *',
          timezone: 'UTC',
          from: new Date('2026-03-08T07:00:00.000Z'),
          to: new Date('2026-03-08T07:00:00.000Z'),
        },
      }),
      baseDefinition({
        key: 'dst',
        schedule: { cron: '0 0 3 * * *', timezone: 'America/New_York' },
      }),
    ];
    await store.reconcile(definitions.map((definition) => entry(definition)));
    const byKey = new Map(
      (await store.list()).map((record) => [record.key, record]),
    );
    expect(byKey.get('five')?.nextRunAt).toBe('2026-03-08T07:00:00.000Z');
    expect(byKey.get('six')?.nextRunAt).toBe('2026-03-08T07:00:30.000Z');
    expect(byKey.get('from')?.nextRunAt).toBe('2026-03-08T07:00:00.000Z');
    expect(byKey.get('dst')?.nextRunAt).toBe('2026-03-08T07:00:00.000Z');
  });

  function rows(table: string): Promise<Row[]> {
    return database.query().selectFrom(table).selectAll().execute();
  }
  async function insertOccurrences(
    schedule: string,
    statuses: readonly string[],
  ): Promise<void> {
    for (const [index, status] of statuses.entries()) {
      await database
        .query()
        .insertInto('schedule_occurrences')
        .values({
          id: `${schedule}-occurrence-${index}`,
          scheduleId: schedule,
          definitionHash: 'definition-hash',
          status,
          targetType: 'report',
          executionCount: 1,
          startedAt: new Date('2026-03-08T00:00:00.000Z'),
          lastStartedAt: new Date('2026-03-08T00:00:00.000Z'),
          createdAt: new Date('2026-03-08T00:00:00.000Z'),
          updatedAt: new Date('2026-03-08T00:00:00.000Z'),
        })
        .execute();
    }
  }
  async function queueRow(id: string): Promise<Row | undefined> {
    const row = await queue.schedules('schedule').get(id);
    return row ? { ...row } : undefined;
  }
});

function entry(definition: ScheduleDefinition) {
  return { definition: defineSchedule(definition) };
}

function baseDefinition(
  overrides: Partial<ScheduleDefinition> = {},
): ScheduleDefinition {
  return {
    key: 'daily',
    title: 'Daily',
    schedule: { cron: '0 0 * * *', timezone: 'UTC' },
    target: { type: 'report', config: { reportKey: 'test' } },
    ...overrides,
  };
}
