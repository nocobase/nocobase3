import { createDatabaseManager, type DatabaseManager } from '@nocobase/db';
import sqlite from '@nocobase/db-sqlite';
import { createQueueManager, type NocoBaseQueueManager } from '@nocobase/queue';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import migration from '../database/migrations/202609020001_scheduler_create_definitions.js';
import { ScheduleOccurrenceStore } from '../server/occurrences.js';
import type { ScheduleDefinition } from '../server/schedules/define.js';
import { ScheduleTargetRegistry } from '../server/schedules/registry.js';
import { DefaultSchedulerService } from '../server/services/scheduler.js';
import { ScheduleStore } from '../server/store.js';

describe('DefaultSchedulerService.defineSchedule', () => {
  let database: DatabaseManager;
  let queue: NocoBaseQueueManager;
  let scheduler: DefaultSchedulerService;

  beforeEach(async () => {
    database = createDatabaseManager({
      drivers: { sqlite },
      connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
    });
    const connection = database.connection();
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
    const store = new ScheduleStore(
      database,
      'main',
      queue.schedules('schedule'),
    );
    const targets = new ScheduleTargetRegistry();
    targets.register({
      type: 'report',
      title: 'Report',
      validate: () => ({ valid: true }),
    });
    scheduler = new DefaultSchedulerService(
      store,
      new ScheduleOccurrenceStore(database),
      targets,
    );
  });

  afterEach(async () => {
    await queue.close();
    await database.destroy();
  });

  it('registers a definition directly and reconciles it on sync', async () => {
    scheduler.defineSchedule(baseDefinition());
    await scheduler.sync();

    const rows = await database
      .query()
      .selectFrom('schedule_definitions')
      .selectAll()
      .execute();
    expect(rows).toMatchObject([{ key: 'daily' }]);
  });

  it('allows different keys in one application', async () => {
    scheduler.defineSchedule(baseDefinition());
    scheduler.defineSchedule(baseDefinition({ key: 'weekly' }));
    await scheduler.sync();

    const rows = await database
      .query()
      .selectFrom('schedule_definitions')
      .selectAll()
      .execute();
    expect(rows).toHaveLength(2);
  });

  it('rejects a duplicate key at sync time', async () => {
    scheduler.defineSchedule(baseDefinition());
    scheduler.defineSchedule(baseDefinition());

    await expect(scheduler.sync()).rejects.toThrow(
      'Duplicate Schedule definition: daily',
    );
  });
});

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
