import { createDatabaseManager, type DatabaseManager } from '@nocobase/db';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import migration from '../database/migrations/202609020001_scheduler_create_definitions.js';
import {
  ScheduleDispatchJob,
  type ScheduleDispatchPayload,
} from '../server/jobs/dispatch.js';
import { ScheduleOccurrenceStore } from '../server/occurrences.js';
import { ScheduleTargetRegistry } from '../server/schedules/registry.js';

describe('@nocobase/app-plugin-scheduler', () => {
  let database: DatabaseManager;

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
    await database
      .query()
      .insertInto('schedule_definitions')
      .values({
        id: 'schedule-1',
        app_name: 'test',
        owner: 'owner',
        key: 'key',
        source_type: 'code',
        title: 'Schedule',
        definition_hash: 'hash',
        cron: '* * * * *',
        timezone: 'UTC',
        enabled: true,
        target_type: 'test',
        target_config: {},
        lifecycle_state: 'active',
        sync_status: 'synced',
        created_at: new Date(),
        updated_at: new Date(),
      })
      .execute();
  });

  afterEach(async () => database.destroy());

  it('declares the fixed Database bridge contract', () => {
    expect(ScheduleDispatchJob.options).toEqual({
      name: 'ScheduleDispatchJob',
      queue: 'schedule',
      adapter: 'database',
      maxRetries: 0,
    });
  });

  it('records one occurrence and increments execution count on re-execution', async () => {
    const execute = vi.fn(async () => ({
      status: 'triggered' as const,
      receipt: { jobId: 'job-2' },
    }));
    const registry = new ScheduleTargetRegistry();
    registry.register({
      type: 'test',
      title: 'Test',
      validate: () => ({ valid: true }),
      describe: async () => ({ targetLabel: 'Test' }),
      execute,
    });
    const job = new ScheduleDispatchJob(
      registry,
      new ScheduleOccurrenceStore(database),
    );
    const payload: ScheduleDispatchPayload = {
      schemaVersion: 1,
      scheduleId: 'schedule-1',
      definitionHash: 'hash',
      target: { type: 'test', config: {} },
    };
    const context = {
      jobId: 'occurrence-1',
      name: 'ScheduleDispatchJob',
      attempt: 1,
      queue: 'schedule',
      priority: 0,
      acquiredAt: new Date(),
      stalledCount: 0,
      scheduleId: 'schedule-1',
      scheduledFor: new Date('2026-09-02T00:00:00.000Z'),
      scheduleRunNumber: 7,
    };
    job.$hydrate(payload, context);
    await job.execute();
    job.$hydrate(payload, { ...context, stalledCount: 1 });
    await job.execute();

    const rows = await database
      .query()
      .selectFrom('schedule_occurrences')
      .selectAll()
      .execute();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 'occurrence-1',
      scheduleId: 'schedule-1',
      runNumber: 7,
      status: 'triggered',
      executionCount: 2,
    });
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('requires Queue-provided occurrence context before writing history', async () => {
    const job = new ScheduleDispatchJob(
      new ScheduleTargetRegistry(),
      new ScheduleOccurrenceStore(database),
    );
    job.$hydrate(
      {
        schemaVersion: 1,
        scheduleId: 'schedule-1',
        definitionHash: 'hash',
        target: { type: 'missing', config: {} },
      },
      {
        jobId: 'occurrence-1',
        name: 'ScheduleDispatchJob',
        attempt: 1,
        queue: 'schedule',
        priority: 0,
        acquiredAt: new Date(),
        stalledCount: 0,
      },
    );
    await expect(job.execute()).rejects.toThrow(
      'complete Schedule occurrence context',
    );
  });
});
