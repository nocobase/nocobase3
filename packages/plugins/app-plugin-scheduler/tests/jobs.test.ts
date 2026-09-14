import { createDatabaseManager, type DatabaseManager } from '@nocobase/db';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import migration from '../database/migrations/202609020001_scheduler_create_definitions.js';
import observationMigration from '../database/migrations/202609100001_scheduler_execution_observation.js';
import {
  ScheduleDispatchJob,
  type ScheduleDispatchPayload,
} from '../server/jobs/dispatch.js';
import { ScheduleOccurrenceStore } from '../server/occurrences.js';
import { ScheduleOccurrenceError } from '../server/occurrences.js';
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
    await observationMigration.up({
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
    const start = vi.fn(async () => ({
      state: 'accepted' as const,
      reference: { type: 'queue-job', id: 'job-2' },
    }));
    const registry = new ScheduleTargetRegistry();
    registry.register({
      type: 'test',
      title: 'Test',
      validate: () => ({ valid: true }),
      describe: async () => ({ targetLabel: 'Test' }),
      start,
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
      status: 'waiting',
      executionCount: 1,
      targetReferenceType: 'queue-job',
      targetReferenceId: 'job-2',
    });
    expect(start).toHaveBeenCalledTimes(1);
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
    await expect(job.execute()).rejects.toThrow('requires a schedule id');
  });

  it('reports asynchronous completion idempotently and rejects reference or terminal conflicts', async () => {
    const store = new ScheduleOccurrenceStore(database);
    await store.start(
      {
        scheduleId: 'schedule-1',
        occurrenceId: 'occurrence-report',
      },
      'hash',
      'test',
    );
    const reference = { type: 'workflow-run', id: '42' };
    await store.wait('occurrence-report', reference, { eventKey: 'event-42' });
    await store.complete('occurrence-report', reference, {
      status: 'succeeded',
      result: { count: 2 },
    });
    await expect(
      store.complete('occurrence-report', reference, { status: 'succeeded' }),
    ).resolves.toBeUndefined();
    await expect(
      store.complete(
        'occurrence-report',
        { type: 'workflow-run', id: 'different' },
        { status: 'succeeded' },
      ),
    ).rejects.toMatchObject<Partial<ScheduleOccurrenceError>>({
      code: 'REFERENCE_MISMATCH',
    });
    await expect(
      store.complete('occurrence-report', reference, { status: 'failed' }),
    ).rejects.toMatchObject<Partial<ScheduleOccurrenceError>>({
      code: 'COMPLETION_CONFLICT',
    });
    await expect(
      database
        .query()
        .selectFrom('schedule_occurrences')
        .selectAll()
        .where('id', '=', 'occurrence-report')
        .executeTakeFirst(),
    ).resolves.toMatchObject({
      status: 'succeeded',
      targetReferenceType: 'workflow-run',
      targetReferenceId: '42',
      resultSummary: JSON.stringify({ count: 2 }),
    });
  });

  it('defers terminal notifications received before the target reference is persisted', async () => {
    const store = new ScheduleOccurrenceStore(database);
    await store.start(
      {
        scheduleId: 'schedule-1',
        occurrenceId: 'occurrence-race',
      },
      'hash',
      'workflow',
    );

    // The workflow terminal observer can win this race with dispatch.wait().
    await expect(
      store.complete(
        'occurrence-race',
        { type: 'workflow-run', id: '137' },
        {
          status: 'succeeded',
        },
      ),
    ).resolves.toBeUndefined();

    await store.wait('occurrence-race', {
      type: 'workflow-run',
      id: '137',
    });
    await store.complete(
      'occurrence-race',
      { type: 'workflow-run', id: '137' },
      {
        status: 'succeeded',
      },
    );
    await expect(
      database
        .query()
        .selectFrom('schedule_occurrences')
        .select('status')
        .where('id', '=', 'occurrence-race')
        .executeTakeFirst(),
    ).resolves.toMatchObject({ status: 'succeeded' });
  });

  it('records dispatch exceptions instead of leaving an occurrence running', async () => {
    const registry = new ScheduleTargetRegistry();
    registry.register({
      type: 'throws',
      title: 'Throws',
      validate: () => ({ valid: true }),
      describe: async () => ({ targetLabel: 'Throws' }),
      start: async () => {
        throw new Error('boom');
      },
    });
    const job = new ScheduleDispatchJob(
      registry,
      new ScheduleOccurrenceStore(database),
    );
    job.$hydrate(
      {
        schemaVersion: 1,
        scheduleId: 'schedule-1',
        definitionHash: 'hash',
        target: { type: 'throws', config: {} },
      },
      {
        jobId: 'occurrence-error',
        name: 'ScheduleDispatchJob',
        attempt: 1,
        queue: 'schedule',
        priority: 0,
        acquiredAt: new Date(),
        stalledCount: 0,
        scheduleId: 'schedule-1',
      },
    );
    await expect(job.execute()).rejects.toThrow('boom');
    await expect(
      database
        .query()
        .selectFrom('schedule_occurrences')
        .selectAll()
        .where('id', '=', 'occurrence-error')
        .executeTakeFirst(),
    ).resolves.toMatchObject({ status: 'failed', reason: 'dispatch-failed' });
  });

  // `@boringnode/queue` is an unmodified dependency, so a dispatch carries only
  // what upstream puts in the context: the job id and the schedule id. This is
  // the shape a real worker delivers, and it has to be enough to record history.
  it('records an occurrence from the stock queue occurrence context', async () => {
    const registry = new ScheduleTargetRegistry();
    registry.register({
      type: 'stock',
      title: 'Stock',
      validate: () => ({ valid: true }),
      describe: async () => ({ targetLabel: 'Stock' }),
      start: async () => ({ state: 'completed', result: { ok: true } }),
      inspect: async () => ({ state: 'unknown', reason: 'not-observed' }),
    });
    const job = new ScheduleDispatchJob(
      registry,
      new ScheduleOccurrenceStore(database),
    );
    job.$hydrate(
      {
        schemaVersion: 1,
        scheduleId: 'schedule-1',
        definitionHash: 'hash',
        target: { type: 'stock', config: {} },
      },
      {
        jobId: 'stock-context',
        name: 'ScheduleDispatchJob',
        attempt: 1,
        queue: 'schedule',
        priority: 0,
        acquiredAt: new Date(),
        stalledCount: 0,
        scheduleId: 'schedule-1',
      },
    );
    await job.execute();
    await expect(
      database
        .query()
        .selectFrom('schedule_occurrences')
        .selectAll()
        .where('id', '=', 'stock-context')
        .executeTakeFirst(),
    ).resolves.toMatchObject({
      scheduleId: 'schedule-1',
      status: 'succeeded',
      executionCount: 1,
    });
  });

  it('preserves the original error when inspection fails after wait', async () => {
    const registry = new ScheduleTargetRegistry();
    registry.register({
      type: 'accepted',
      title: 'Accepted',
      validate: () => ({ valid: true }),
      describe: async () => ({ targetLabel: 'Accepted' }),
      start: async () => ({
        state: 'accepted',
        reference: { type: 'x', id: '1' },
      }),
      inspect: async () => {
        throw new Error('inspect-boom');
      },
    });
    const job = new ScheduleDispatchJob(
      registry,
      new ScheduleOccurrenceStore(database),
    );
    job.$hydrate(
      {
        schemaVersion: 1,
        scheduleId: 'schedule-1',
        definitionHash: 'hash',
        target: { type: 'accepted', config: {} },
      },
      {
        jobId: 'occurrence-inspect-error',
        name: 'ScheduleDispatchJob',
        attempt: 1,
        queue: 'schedule',
        priority: 0,
        acquiredAt: new Date(),
        stalledCount: 0,
        scheduleId: 'schedule-1',
      },
    );
    await expect(job.execute()).rejects.toThrow('inspect-boom');
  });

  it('reconciles a missed asynchronous completion from the target observer', async () => {
    const store = new ScheduleOccurrenceStore(database);
    const registry = new ScheduleTargetRegistry();
    registry.register({
      type: 'observed',
      title: 'Observed',
      validate: () => ({ valid: true }),
      describe: async () => ({ targetLabel: 'Observed' }),
      start: async () => ({
        state: 'accepted',
        reference: { type: 'remote-run', id: 'run-1' },
      }),
      inspect: async () => ({
        state: 'completed',
        completion: { status: 'failed', reason: 'execution-failed' },
      }),
    });
    await store.start(
      {
        scheduleId: 'schedule-1',
        occurrenceId: 'occurrence-reconcile',
      },
      'hash',
      'observed',
    );
    await store.wait('occurrence-reconcile', {
      type: 'remote-run',
      id: 'run-1',
    });

    await expect(store.reconcile(registry)).resolves.toBe(1);
    await expect(
      database
        .query()
        .selectFrom('schedule_occurrences')
        .selectAll()
        .where('id', '=', 'occurrence-reconcile')
        .executeTakeFirst(),
    ).resolves.toMatchObject({
      status: 'failed',
      reason: 'execution-failed',
      lastObservedAt: expect.anything(),
    });
  });
});
