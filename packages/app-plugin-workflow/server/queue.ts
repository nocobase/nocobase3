import { Job } from '@nocobase/queue';
import type {
  JobOptions,
  NocoBaseQueueManager,
  NocoBaseQueueWorker,
  QueueDispatchOptions,
} from '@nocobase/queue';

import type { WorkflowQueue, WorkflowQueueTask } from './engine/types.js';

export const WORKFLOW_QUEUE_NAME = 'workflow';
export const WORKFLOW_TASK_JOB_NAME = 'nocobase.workflow.task';

export type WorkflowTaskDispatch = (
  task: WorkflowQueueTask,
) => Promise<unknown>;

/**
 * Queue name -> dispatch handler.
 *
 * `@boringnode/queue` builds job instances itself through its locator, so the
 * handler cannot be injected through the constructor. Routing by the queue the
 * job was consumed from keeps one job class usable by several adapters.
 */
const dispatchers = new Map<string, WorkflowTaskDispatch>();

/** Payload of a workflow queue job is exactly a `WorkflowQueueTask`. */
export class WorkflowTaskJob extends Job<WorkflowQueueTask> {
  static options: JobOptions = {
    name: WORKFLOW_TASK_JOB_NAME,
    queue: WORKFLOW_QUEUE_NAME,
  };

  async execute(): Promise<void> {
    const dispatch = dispatchers.get(this.context.queue);
    if (!dispatch) {
      throw new Error(
        `No workflow queue adapter is listening on queue "${this.context.queue}"`,
      );
    }
    await dispatch(this.payload);
  }
}

/** Delay accepted by `@boringnode/queue`: milliseconds or a duration string such as `'5s'`. */
export type WorkflowQueueDelay = NonNullable<QueueDispatchOptions['delay']>;

export interface PublishWorkflowTaskOptions {
  queueName?: string;
  /**
   * Deliver the task later instead of immediately.
   *
   * Nothing uses this in the first version; it is kept wired up so a future
   * `delay`-style node has the capability available without reworking the
   * adapter. `WorkflowQueue.publish()` stays a one-argument method.
   */
  delay?: WorkflowQueueDelay;
}

export async function publishWorkflowTask(
  queue: NocoBaseQueueManager,
  task: WorkflowQueueTask,
  options: PublishWorkflowTaskOptions = {},
): Promise<void> {
  await queue.dispatch(WorkflowTaskJob, task, {
    queue: options.queueName ?? WORKFLOW_QUEUE_NAME,
    ...(options.delay === undefined ? {} : { delay: options.delay }),
  });
}

export interface WorkflowQueueAdapter extends WorkflowQueue {
  startWorker(): Promise<void>;
  stop(): Promise<void>;
}

export interface WorkflowQueueAdapterOptions {
  queue: NocoBaseQueueManager;
  dispatch: (task: WorkflowQueueTask) => Promise<unknown>;
  queueName?: string;
}

/**
 * Connects `WorkflowQueue` to the existing `@nocobase/queue` implementation.
 *
 * Creating an adapter registers its dispatch handler immediately — the `sync`
 * driver runs a job inside `publish()`, before any worker exists — and `stop()`
 * unregisters it again.
 */
export function createWorkflowQueueAdapter(
  options: WorkflowQueueAdapterOptions,
): WorkflowQueueAdapter {
  const queueName = options.queueName ?? WORKFLOW_QUEUE_NAME;
  const existing = dispatchers.get(queueName);
  if (existing && existing !== options.dispatch) {
    throw new Error(
      `A workflow queue adapter is already listening on queue "${queueName}"`,
    );
  }
  dispatchers.set(queueName, options.dispatch);
  options.queue.registerJob(WorkflowTaskJob);

  let worker: NocoBaseQueueWorker | null = null;
  let workerLoop: Promise<void> | null = null;
  let workerError: unknown = null;

  return {
    async publish(task: WorkflowQueueTask): Promise<void> {
      await publishWorkflowTask(options.queue, task, { queueName });
    },

    async startWorker(): Promise<void> {
      if (worker) {
        return;
      }
      const started = options.queue.createWorker({ queues: [queueName] });
      worker = started;
      workerError = null;
      // `Worker.start()` only settles once the worker is stopped, so the polling
      // loop runs in the background and `stop()` is what awaits it.
      workerLoop = started.start([queueName]).catch((error: unknown) => {
        workerError = error;
      });
    },

    async stop(): Promise<void> {
      if (dispatchers.get(queueName) === options.dispatch) {
        dispatchers.delete(queueName);
      }
      const started = worker;
      const loop = workerLoop;
      worker = null;
      workerLoop = null;
      if (started) {
        await started.stop();
      }
      if (loop) {
        await loop;
      }
      if (workerError) {
        const error = workerError;
        workerError = null;
        throw error;
      }
    },
  };
}
