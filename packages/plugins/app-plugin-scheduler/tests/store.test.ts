import {
  createDatabaseManager,
  type DatabaseManager,
  type Row,
} from '@nocobase/db';
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
  let store: ScheduleStore;

  beforeEach(async () => {
    database = createDatabaseManager({
      connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
    });
    const connection = database.connection();
    await migration.up({
      builder: connection.builder,
      query: connection.query,
      connection,
    });
    store = new ScheduleStore(database, 'main', () => new Date(NOW));
  });

  afterEach(async () => database.destroy());

  it('creates stable one-to-one product and Queue projections', async () => {
    await store.reconcile([entry(baseDefinition())]);
    await store.reconcile([entry(baseDefinition())]);
    const id = scheduleId('main', 'plugin-a', 'daily');
    await expect(rows('schedule_definitions')).resolves.toHaveLength(1);
    await expect(rows('queue_schedules')).resolves.toMatchObject([
      {
        id,
        name: 'ScheduleDispatchJob',
        status: 'active',
        runCount: 0,
        lastRunAt: null,
        nextRunAt: Date.parse('2026-03-09T00:00:00.000Z'),
      },
    ]);
  });

  it('preserves Queue counters and next time for unchanged, content-only, and enabled updates', async () => {
    await store.reconcile([entry(baseDefinition())]);
    const id = scheduleId('main', 'plugin-a', 'daily');
    await database
      .query()
      .updateTable('queue_schedules')
      .set({
        runCount: 9,
        lastRunAt: '2026-03-07T00:00:00.000Z',
        nextRunAt: '2026-03-10T00:00:00.000Z',
      })
      .where('id', '=', id)
      .execute();

    await store.reconcile([
      entry(baseDefinition({ title: 'Renamed', enabled: false })),
    ]);
    await expect(queueRow(id)).resolves.toMatchObject({
      status: 'paused',
      runCount: 9,
      lastRunAt: '2026-03-07T00:00:00.000Z',
      nextRunAt: '2026-03-10T00:00:00.000Z',
    });
  });

  it('recalculates schedule fields without resetting history counters', async () => {
    await store.reconcile([entry(baseDefinition())]);
    const id = scheduleId('main', 'plugin-a', 'daily');
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
      nextRunAt: Date.parse('2026-03-08T12:00:00.000Z'),
    });
  });

  it('only finalize deactivates missing code definitions and reactivation preserves identity and history', async () => {
    await store.reconcile([entry(baseDefinition())]);
    const id = scheduleId('main', 'plugin-a', 'daily');
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

  it('rolls back the complete reconciliation when a projection write fails', async () => {
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
    await expect(rows('schedule_definitions')).resolves.toEqual([]);
    await expect(rows('queue_schedules')).resolves.toEqual([]);
    await expect(rows('schedule_sync_locks')).resolves.toEqual([]);
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
  function queueRow(id: string): Promise<Row | undefined> {
    return database
      .query()
      .selectFrom('queue_schedules')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }
});

function entry(definition: ScheduleDefinition) {
  return { owner: 'plugin-a', definition: defineSchedule(definition) };
}

function baseDefinition(
  overrides: Partial<ScheduleDefinition> = {},
): ScheduleDefinition {
  return {
    key: 'daily',
    title: 'Daily',
    schedule: { cron: '0 0 * * *', timezone: 'UTC' },
    target: { type: 'job', config: { jobName: 'test', payload: {} } },
    ...overrides,
  };
}
