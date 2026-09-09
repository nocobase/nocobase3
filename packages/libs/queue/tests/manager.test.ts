import { Job, QueueSchemaService } from '@boringnode/queue';
import { createDatabaseManager } from '@nocobase/db';
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

  it('hydrates claimed Schedule windows and run numbers into Job context', async () => {
    const database = createDatabaseManager({
      connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
    });
    const connection = await database.connect();
    const client = await connection.client<Knex>();
    const schema = new QueueSchemaService(client);
    await schema.createJobsTable('queue_jobs');
    await schema.createSchedulesTable('queue_schedules');
    const scheduledFor = new Date(Date.now() - 1_000);
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
    await database
      .query()
      .insertInto('queue_schedules')
      .values({
        id: 'schedule-context',
        status: 'active',
        name: 'QueueManagerScheduleContext',
        payload: JSON.stringify({}),
        cronExpression: '* * * * * *',
        everyMs: null,
        timezone: 'UTC',
        fromDate: null,
        toDate: null,
        runLimit: 10,
        runCount: 4,
        nextRunAt: scheduledFor,
        lastRunAt: null,
        createdAt: new Date(),
      })
      .execute();
    const worker = queueManager.createWorker({
      connection: 'database',
      queues: ['schedule'],
      concurrency: 1,
    });
    const completion = worker.start();
    try {
      await waitFor(() => captured !== undefined);
      expect(captured).toMatchObject({
        scheduleId: 'schedule-context',
        scheduledFor,
        scheduleRunNumber: 5,
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
});

class ScheduleContextJob extends Job<Record<string, never>> {
  static options = {
    name: 'QueueManagerScheduleContext',
    queue: 'schedule',
    adapter: 'database',
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
