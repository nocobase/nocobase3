import { createRequire } from 'node:module';
import type { QueueOptions } from '@nocobase/queue';
import { createQueueIdentity } from '../../../../libs/queue/src/identity.js';

export interface ObservedJob {
  id?: string;
  attemptsMade: number;
  promote(): Promise<void>;
}
export interface QueueObserver {
  getJob(id: string): Promise<ObservedJob | undefined>;
  getJobState(id: string): Promise<string>;
  getJobCounts(...states: string[]): Promise<Record<string, number>>;
  close(): Promise<void>;
  obliterate(options: { force: boolean }): Promise<void>;
}

export function persistentOptions(namespace: string): QueueOptions {
  const backend = process.env.QUEUE_TEST_BACKEND;
  if (backend !== 'redis') {
    throw new Error(
      'Select redis through the isolated queue integration runner',
    );
  }
  if (!process.env.QUEUE_TEST_RUN?.startsWith('nbq-')) {
    throw new Error(
      'QUEUE_TEST_RUN must identify an isolated queue integration runner',
    );
  }
  const port = Number(process.env.QUEUE_TEST_REDIS_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(
      'Missing isolated queue runner port; no default server is allowed',
    );
  }
  return {
    namespace,
    queueBackend: backend,
    connection: {
      host: '127.0.0.1',
      port,
    },
    attempts: 2,
    removeOnComplete: false,
    removeOnFail: false,
  };
}

/** Inspect the installed queue backend, without adding a plugin runtime dependency. */
export function observeQueue(
  options: QueueOptions,
  logicalName: string,
): QueueObserver {
  const requireQueue = createRequire(
    new URL('../../node_modules/@nocobase/queue/package.json', import.meta.url),
  );
  const native = requireQueue('bullmq') as {
    Queue: new (name: string, options: unknown) => QueueObserver;
  };
  const identity = createQueueIdentity(options.namespace, logicalName);
  return new native.Queue(identity.redisQueueName, {
    connection: { ...(options.connection as object) },
    prefix: identity.redisPrefix,
    skipMetasUpdate: true,
  });
}
