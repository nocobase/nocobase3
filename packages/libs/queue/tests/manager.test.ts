import { createSchedules } from './schedule-fixture.js';
import { Job, QueueSchemaService } from '@boringnode/queue';
import { createDatabaseManager } from '@nocobase/db';
import sqlite from '@nocobase/db-sqlite';
import type { Knex } from 'knex';
import { describe, expect, it } from 'vitest';

import {
  assertDefaultConnection,
  createQueueManager,
  createSyncQueueConfig,
  type AppQueueConfig,
} from '../src/index.js';

const executedPayloads: unknown[] = [];

class DemoJob extends Job<{ id: string }> {
  static options = {
    name: 'QueueManagerTestDemo',
    queue: 'demo',
  };

  async execute(): Promise<void> {
    executedPayloads.push(this.payload);
  }
}

describe('createQueueManager', () => {
  it('dispatches jobs through the sync connection', async () => {
    executedPayloads.length = 0;
    const queueManager = createQueueManager(createConfig());

    const result = await queueManager.dispatch(DemoJob, { id: 'job-1' });

    expect(result.jobId).toEqual(expect.any(String));
    expect(executedPayloads).toEqual([{ id: 'job-1' }]);

    await queueManager.close();
  });

  it('dispatches many jobs through the sync connection', async () => {
    executedPayloads.length = 0;
    const queueManager = createQueueManager(createConfig());

    const result = await queueManager.dispatchMany(DemoJob, [
      { id: 'job-1' },
      { id: 'job-2' },
    ]);

    expect(result.jobIds).toHaveLength(2);
    expect(executedPayloads).toEqual([{ id: 'job-1' }, { id: 'job-2' }]);

    await queueManager.close();
  });

  it('closes idempotently', async () => {
    const queueManager = createQueueManager(createSyncQueueConfig());

    await queueManager.init();
    await expect(queueManager.close()).resolves.toBeUndefined();
    await expect(queueManager.close()).resolves.toBeUndefined();
  });

  it('does not require database dependencies for inactive database connections', async () => {
    const queueManager = createQueueManager({
      default: 'sync',
      connections: {
        sync: {
          driver: 'sync',
        },
        database: {
          driver: 'database',
          table: 'queue_jobs',
          schedulesTable: 'queue_schedules',
        },
      },
      jobs: {
        autoLoad: false,
        locations: [],
      },
    });

    await expect(queueManager.init()).resolves.toBeUndefined();
    await queueManager.close();
  });

  it('hydrates the claimed Schedule id into Job context', async () => {
    const database = createDatabaseManager({
      drivers: { sqlite },
      connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
    });
    const connection = await database.connect();
    const client = await connection.client<Knex>();
    const schema = new QueueSchemaService(client);
    await schema.createJobsTable('queue_jobs');
    await createSchedules(database.connection());
    const dueAt = new Date(Date.now() - 1_000);
    let captured:
      InstanceType<typeof ScheduleContextJob>['context'] | undefined;
    ScheduleContextJob.capture = (context) => {
      captured = context;
    };
    const queueManager = createQueueManager(
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
        worker: { idleDelay: '10ms' },
      },
      { database },
    );
    queueManager.registerJob(ScheduleContextJob);
    await queueManager.init();
    const schedules = queueManager.schedules('schedule');
    await schedules.upsert({
      id: 'schedule-context',
      name: 'QueueManagerScheduleContext',
      payload: {},
      cronExpression: '* * * * * *',
      timezone: 'UTC',
      limit: 10,
    });
    await schedules.update('schedule-context', {
      runCount: 4,
      nextRunAt: dueAt,
    });
    const worker = queueManager.createWorker({
      queues: ['schedule'],
      concurrency: 1,
    });
    const completion = worker.start();
    try {
      await waitFor(() => captured !== undefined);
      // `@boringnode/queue` is used unmodified, so a claimed Schedule reaches
      // its Job with the schedule id and the job id and nothing more. Consumers
      // that need per-firing detail derive it themselves rather than expecting
      // the transport to carry it.
      expect(captured).toMatchObject({
        scheduleId: 'schedule-context',
        jobId: expect.any(String),
      });
    } finally {
      await worker.stop();
      await completion;
      await queueManager.close();
      await database.destroy();
      ScheduleContextJob.capture = undefined;
    }
  });

  it.each(['start', 'options', 'global', 'override'] as const)(
    'consumes jobs using the %s connection selection',
    async (selection) => {
      executedPayloads.length = 0;
      const database = createDatabaseManager({
        drivers: { sqlite },
        connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
      });
      const client = await (await database.connect()).client<Knex>();
      const schema = new QueueSchemaService(client);
      await schema.createJobsTable('queue_jobs');
      await createSchedules(database.connection());
      const queueManager = createQueueManager(
        {
          default: 'sync',
          connections: {
            sync: { driver: 'sync' },
            database: { driver: 'database' },
          },
          queues: {
            demo: {
              connection:
                selection === 'global' || selection === 'override'
                  ? 'sync'
                  : 'database',
            },
            transport: { connection: 'database' },
          },
          worker: {
            idleDelay: '10ms',
            connection:
              selection === 'global'
                ? 'database'
                : selection === 'override'
                  ? 'sync'
                  : undefined,
          },
          jobs: { autoLoad: false, locations: [] },
        },
        { database },
      );
      try {
        await queueManager.dispatch(
          DemoJob,
          { id: selection },
          { connection: 'database' },
        );
        expect(executedPayloads).toEqual([]);
        const worker = queueManager.createWorker({
          queues: selection === 'start' ? undefined : ['demo'],
          connection: selection === 'override' ? 'database' : undefined,
        });
        const completion = worker.start(
          selection === 'start' ? ['demo'] : undefined,
        );
        try {
          await Promise.race([
            waitFor(() => executedPayloads.length === 1),
            completion,
          ]);
          expect(executedPayloads).toEqual([{ id: selection }]);
          if (selection === 'start') {
            await expect(worker.start(['default'])).rejects.toThrow(
              'cannot consume queues',
            );
          }
        } finally {
          await worker.stop();
          await completion;
        }
      } finally {
        await queueManager.close();
        await database.destroy();
      }
    },
  );

  it('requires a DatabaseManager for active database connections', async () => {
    const queueManager = createQueueManager({
      default: 'database',
      connections: {
        database: {
          driver: 'database',
        },
      },
      jobs: {
        autoLoad: false,
        locations: [],
      },
    });

    await expect(queueManager.init()).rejects.toThrow(
      'Queue database connection requires a configured DatabaseManager.',
    );
  });

  it('creates a sync fallback config', () => {
    expect(createSyncQueueConfig()).toMatchObject({
      default: 'sync',
      connections: {
        sync: {
          driver: 'sync',
        },
      },
    });
  });

  it('rejects scheduled jobs on the sync connection', () => {
    const queueManager = createQueueManager(createSyncQueueConfig());
    expect(() => queueManager.schedules()).toThrow(
      'sync connection, which does not support scheduled jobs',
    );
  });

  it('uses the connection selected by a logical queue for schedules', async () => {
    const queueManager = createQueueManager({
      default: 'sync',
      connections: {
        sync: { driver: 'sync' },
        memory: { driver: 'fake' },
      },
      queues: { schedule: { connection: 'memory' } },
      jobs: { autoLoad: false, locations: [] },
    });
    await queueManager.init();
    const schedules = queueManager.schedules('schedule');
    await schedules.upsert({
      id: 'environment-selected',
      name: 'QueueManagerTestDemo',
      payload: { id: 'scheduled' },
      cronExpression: '0 0 * * *',
      timezone: 'UTC',
    });
    expect(await schedules.get('environment-selected')).toMatchObject({
      id: 'environment-selected',
      name: 'QueueManagerTestDemo',
    });
    await queueManager.close();
  });
});

class ScheduleContextJob extends Job<Record<string, never>> {
  static options = {
    name: 'QueueManagerScheduleContext',
    queue: 'schedule',
  };
  static capture:
    | ((context: InstanceType<typeof ScheduleContextJob>['context']) => void)
    | undefined;

  async execute(): Promise<void> {
    ScheduleContextJob.capture?.(this.context);
  }
}

async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  timeoutMs = 5_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Timed out waiting for the Queue worker.');
}

describe('assertDefaultConnection', () => {
  it('throws when the default connection is missing', () => {
    expect(() =>
      assertDefaultConnection({
        default: 'missing',
        connections: {},
      }),
    ).toThrow('Default queue connection "missing" is not configured.');
  });
});

function createConfig(): AppQueueConfig {
  return {
    default: 'sync',
    connections: {
      sync: {
        driver: 'sync',
      },
    },
    queues: {
      demo: {
        connection: 'sync',
      },
    },
    jobs: {
      autoLoad: false,
      locations: [],
    },
  };
}
