import type { DatabaseManager } from '@nocobase/database';
import { QueueSchemaService } from '@boringnode/queue';
import {
  createQueueManager,
  type AppQueueConfig,
  type NocoBaseQueueManager,
} from '@nocobase/queue';
import type { Knex } from 'knex';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createWorkflowQueueAdapter,
  publishWorkflowTask,
  WORKFLOW_QUEUE_NAME,
  WORKFLOW_TASK_JOB_NAME,
  WorkflowTaskJob,
  type WorkflowQueueAdapter,
  type WorkflowQueueTask,
} from '../engine/index.js';
import { createTestDatabase } from './helpers.js';

const QUEUE_TABLE = 'queue_jobs';
const SCHEDULES_TABLE = 'queue_schedules';

function databaseQueueConfig(): AppQueueConfig {
  return {
    default: 'database',
    connections: {
      database: {
        driver: 'database',
        table: QUEUE_TABLE,
        schedulesTable: SCHEDULES_TABLE,
      },
    },
    worker: {
      queues: [WORKFLOW_QUEUE_NAME],
      concurrency: 1,
      idleDelay: '10ms',
    },
    jobs: { autoLoad: false, locations: [] },
  };
}

async function createQueueTables(database: DatabaseManager): Promise<void> {
  const connection = await database.connect();
  const client = await connection.client<Knex>();
  const schema = new QueueSchemaService(client);
  await schema.createJobsTable(QUEUE_TABLE);
  await schema.createSchedulesTable(SCHEDULES_TABLE);
}

async function countPendingJobs(database: DatabaseManager): Promise<number> {
  const rows = await database
    .query()
    .selectFrom(QUEUE_TABLE)
    .selectAll()
    .where('status', '=', 'pending')
    .execute();
  return rows.length;
}

async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  timeoutMs = 5000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Timed out waiting for the queue');
}

describe('workflow queue adapter', () => {
  let database: DatabaseManager;
  let queueManager: NocoBaseQueueManager | null = null;
  const adapters: WorkflowQueueAdapter[] = [];

  function track(adapter: WorkflowQueueAdapter): WorkflowQueueAdapter {
    adapters.push(adapter);
    return adapter;
  }

  beforeEach(async () => {
    database = await createTestDatabase();
    await createQueueTables(database);
  });

  afterEach(async () => {
    // The dispatch registry is module-global, so a failed test must not leak
    // its queue name into the next one.
    await Promise.allSettled(adapters.map((adapter) => adapter.stop()));
    adapters.length = 0;
    await queueManager?.close();
    queueManager = null;
    await database.destroy();
  });

  it('carries a task through the database driver and back into dispatch', async () => {
    const dispatched: WorkflowQueueTask[] = [];
    queueManager = createQueueManager(databaseQueueConfig(), { database });
    const adapter = track(
      createWorkflowQueueAdapter({
        queue: queueManager,
        dispatch: async (task) => {
          dispatched.push(task);
        },
      }),
    );

    // Publishing persists the task; nothing runs until a worker is started.
    await adapter.publish({
      executionId: 7,
      nodeRunId: 42,
      rerun: { nodeKey: 'check', overwrite: true },
    });
    expect(await countPendingJobs(database)).toBe(1);
    expect(dispatched).toEqual([]);

    await adapter.startWorker();
    await waitFor(() => dispatched.length === 1);
    expect(dispatched).toEqual([
      {
        executionId: 7,
        nodeRunId: 42,
        rerun: { nodeKey: 'check', overwrite: true },
      },
    ]);

    await adapter.stop();
  });

  it('survives a restart because the task stays in the database', async () => {
    queueManager = createQueueManager(databaseQueueConfig(), { database });
    const publisher = track(
      createWorkflowQueueAdapter({
        queue: queueManager,
        dispatch: async () => undefined,
      }),
    );
    await publisher.publish({ executionId: 1 });
    await publisher.stop();
    await queueManager.close();
    expect(await countPendingJobs(database)).toBe(1);

    // A fresh process: new queue manager, new adapter, same table.
    const dispatched: WorkflowQueueTask[] = [];
    queueManager = createQueueManager(databaseQueueConfig(), { database });
    const consumer = track(
      createWorkflowQueueAdapter({
        queue: queueManager,
        dispatch: async (task) => {
          dispatched.push(task);
        },
      }),
    );
    await consumer.startWorker();
    await waitFor(() => dispatched.length === 1);
    expect(dispatched).toEqual([{ executionId: 1 }]);

    await consumer.stop();
  });

  it('keeps the delayed delivery capability available for later node types', async () => {
    const dispatched: WorkflowQueueTask[] = [];
    queueManager = createQueueManager(databaseQueueConfig(), { database });
    const adapter = track(
      createWorkflowQueueAdapter({
        queue: queueManager,
        dispatch: async (task) => {
          dispatched.push(task);
        },
      }),
    );

    await publishWorkflowTask(
      queueManager,
      { executionId: 3 },
      { delay: '30s' },
    );
    const rows = await database
      .query()
      .selectFrom(QUEUE_TABLE)
      .selectAll()
      .execute();
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('delayed');

    await adapter.startWorker();
    // The worker must not pick a delayed task up before it is due.
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(dispatched).toEqual([]);

    await adapter.stop();
  });

  it('refuses a second adapter on the same queue name', async () => {
    queueManager = createQueueManager(databaseQueueConfig(), { database });
    const adapter = track(
      createWorkflowQueueAdapter({
        queue: queueManager,
        dispatch: async () => undefined,
      }),
    );

    expect(() =>
      createWorkflowQueueAdapter({
        queue: queueManager!,
        dispatch: async () => undefined,
      }),
    ).toThrow(
      `A workflow queue adapter is already listening on queue "${WORKFLOW_QUEUE_NAME}"`,
    );

    await adapter.stop();
    // After stop() the queue name is free again.
    const replacement = track(
      createWorkflowQueueAdapter({
        queue: queueManager,
        dispatch: async () => undefined,
      }),
    );
    await replacement.stop();
  });

  it('routes by queue name so two adapters can coexist', async () => {
    const defaultTasks: WorkflowQueueTask[] = [];
    const otherTasks: WorkflowQueueTask[] = [];
    queueManager = createQueueManager(
      {
        ...databaseQueueConfig(),
        worker: {
          queues: [WORKFLOW_QUEUE_NAME, 'workflow-other'],
          concurrency: 1,
          idleDelay: '10ms',
        },
      },
      { database },
    );

    const first = track(
      createWorkflowQueueAdapter({
        queue: queueManager,
        dispatch: async (task) => {
          defaultTasks.push(task);
        },
      }),
    );
    const second = track(
      createWorkflowQueueAdapter({
        queue: queueManager,
        queueName: 'workflow-other',
        dispatch: async (task) => {
          otherTasks.push(task);
        },
      }),
    );

    await first.publish({ executionId: 1 });
    await second.publish({ executionId: 2 });
    await first.startWorker();
    await second.startWorker();
    await waitFor(() => defaultTasks.length === 1 && otherTasks.length === 1);

    expect(defaultTasks).toEqual([{ executionId: 1 }]);
    expect(otherTasks).toEqual([{ executionId: 2 }]);

    await first.stop();
    await second.stop();
  });

  it('names the job class stably so a persisted task keeps resolving', () => {
    expect(WorkflowTaskJob.options.name).toBe(WORKFLOW_TASK_JOB_NAME);
    expect(WorkflowTaskJob.options.queue).toBe(WORKFLOW_QUEUE_NAME);
  });
});
