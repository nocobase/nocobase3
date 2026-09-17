import type { QueueService } from '@nocobase/queue';
import type { WorkflowQueue, WorkflowQueueTask } from './engine/types.js';

export const WORKFLOW_QUEUE_NAME = 'workflow';
export const WORKFLOW_TASK_JOB_NAME = 'nocobase.workflow.task';
export type WorkflowTaskDispatch = (
  task: WorkflowQueueTask,
) => Promise<unknown>;
export type WorkflowQueueDelay = number;

export interface PublishWorkflowTaskOptions {
  queueName?: string;
  /** Delay in milliseconds. */
  delay?: WorkflowQueueDelay;
}

export async function publishWorkflowTask(
  queue: QueueService,
  task: WorkflowQueueTask,
  options: PublishWorkflowTaskOptions = {},
): Promise<void> {
  await queue
    .producer(options.queueName ?? WORKFLOW_QUEUE_NAME)
    .publish(
      WORKFLOW_TASK_JOB_NAME,
      task,
      options.delay === undefined ? {} : { delay: options.delay },
    );
}

export interface WorkflowQueueAdapter extends WorkflowQueue {
  /** Unregisters and waits for in-flight dispatch without closing the shared Worker. */
  stop(): Promise<void>;
}

export interface WorkflowQueueAdapterOptions {
  queue: QueueService;
  dispatch: WorkflowTaskDispatch;
  queueName?: string;
}

/** Instance-local registration; no global job locator or owned Worker. */
export function createWorkflowQueueAdapter(
  options: WorkflowQueueAdapterOptions,
): WorkflowQueueAdapter {
  const queueName = options.queueName ?? WORKFLOW_QUEUE_NAME;
  const unregister = options.queue
    .consumer(queueName)
    .consume<WorkflowQueueTask>(async (channel, task) => {
      if (channel !== WORKFLOW_TASK_JOB_NAME) return;
      await options.dispatch(task);
    });
  let stopping: Promise<void> | undefined;
  return {
    async publish(task): Promise<void> {
      await publishWorkflowTask(options.queue, task, { queueName });
    },
    stop(): Promise<void> {
      stopping ??= unregister();
      return stopping;
    },
  };
}
