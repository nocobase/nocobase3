import { createQueueService, type QueueService } from '@nocobase/queue';
import { afterEach, expect, it } from 'vitest';
import {
  createWorkflowQueueAdapter,
  publishWorkflowTask,
  WORKFLOW_QUEUE_NAME,
  WORKFLOW_TASK_JOB_NAME,
  type WorkflowQueueAdapter,
} from '../server/queue.js';

const services: QueueService[] = [];
const adapters: WorkflowQueueAdapter[] = [];
function createQueue(): QueueService {
  const queue = createQueueService({ namespace: 'workflow-adapter-test' });
  services.push(queue);
  return queue;
}
function adapter(
  options: Parameters<typeof createWorkflowQueueAdapter>[0],
): WorkflowQueueAdapter {
  const result = createWorkflowQueueAdapter(options);
  adapters.push(result);
  return result;
}
afterEach(async () => {
  await Promise.all(adapters.splice(0).map((item) => item.stop()));
  await Promise.all(services.splice(0).map((item) => item.shutdown()));
});

it('routes the workflow channel and preserves the complete task payload', async () => {
  const queue = createQueue();
  const received: unknown[] = [];
  const consumer = adapter({
    queue,
    dispatch: async (task) => {
      received.push(task);
    },
  });
  expect(received).toEqual([]);
  await queue.setup();
  await queue
    .producer(WORKFLOW_QUEUE_NAME)
    .publish('unrelated', { executionId: 99 });
  const task = {
    executionId: 7,
    nodeRunId: 42,
    rerun: { nodeKey: 'check', overwrite: true },
  };
  await consumer.publish(task);
  await expect.poll(() => received).toEqual([task]);
});

it('accepts a millisecond delay on a custom queue', async () => {
  const queue = createQueue();
  const started: number[] = [];
  adapter({
    queue,
    queueName: 'custom',
    dispatch: async () => {
      started.push(Date.now());
    },
  });
  await queue.setup();
  const before = Date.now();
  await publishWorkflowTask(
    queue,
    { executionId: 1 },
    { queueName: 'custom', delay: 150 },
  );
  expect(started).toEqual([]);
  await expect.poll(() => started.length).toBe(1);
  expect(started[0]! - before).toBeGreaterThanOrEqual(140);
});

it('waits for dispatch when unregistering without shutting down the shared worker', async () => {
  const queue = createQueue();
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const consumer = adapter({
    queue,
    dispatch: async () => {
      entered.resolve();
      await release.promise;
    },
  });
  await queue.setup();
  try {
    await consumer.publish({ executionId: 1 });
    await entered.promise;
    let stopped = false;
    const stop = consumer.stop().then(() => {
      stopped = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(stopped).toBe(false);
    release.resolve();
    await stop;
    const received: unknown[] = [];
    adapter({
      queue,
      dispatch: async (task) => {
        received.push(task);
      },
    });
    await queue
      .producer(WORKFLOW_QUEUE_NAME)
      .publish(WORKFLOW_TASK_JOB_NAME, { executionId: 2 });
    await expect.poll(() => received).toEqual([{ executionId: 2 }]);
  } finally {
    release.resolve();
  }
});

it('retries a failed dispatch and leaves deduplication of business effects to the handler', async () => {
  const queue = createQueue();
  let attempts = 0;
  const effects = new Set<number>();
  adapter({
    queue,
    dispatch: async (task) => {
      attempts += 1;
      effects.add(Number(task.executionId));
      if (attempts === 1) throw new Error('Transient acknowledgement failure');
    },
  });
  await queue.setup();
  await queue
    .producer(WORKFLOW_QUEUE_NAME)
    .publish(WORKFLOW_TASK_JOB_NAME, { executionId: 17 }, { attempts: 2 });
  await expect.poll(() => attempts).toBe(2);
  expect([...effects]).toEqual([17]);
});
