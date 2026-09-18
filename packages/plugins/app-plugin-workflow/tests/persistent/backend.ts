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
  if (backend !== 'redis' && backend !== 'postgres') {
    throw new Error(
      'Select redis or postgres through the isolated queue integration runner',
    );
  }
  if (!process.env.QUEUE_TEST_RUN?.startsWith('nbq-')) {
    throw new Error(
      'QUEUE_TEST_RUN must identify an isolated queue integration runner',
    );
  }
  const port = Number(
    process.env[
      backend === 'redis' ? 'QUEUE_TEST_REDIS_PORT' : 'QUEUE_TEST_PG_PORT'
    ],
  );
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
      ...(backend === 'postgres'
        ? {
            user: 'postgres',
            password: 'queue-test-only',
            database: 'postgres',
          }
        : {}),
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
    Queue: new (
      name: string,
      options: unknown,
      factory?: unknown,
    ) => QueueObserver;
    createPostgresBackend: unknown;
  };
  const identity = createQueueIdentity(options.namespace, logicalName);
  const postgres = options.queueBackend === 'postgres';
  return new native.Queue(
    postgres ? identity.postgresQueueName : identity.redisQueueName,
    {
      connection: {
        ...(options.connection as object),
        ...(postgres ? { migrate: false } : {}),
      },
      prefix: identity.redisPrefix,
      skipMetasUpdate: true,
    },
    postgres ? native.createPostgresBackend : undefined,
  );
}
