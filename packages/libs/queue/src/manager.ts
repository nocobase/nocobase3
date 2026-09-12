import { randomUUID } from 'node:crypto';

import { Job, Locator, QueueManager, Worker } from '@boringnode/queue';
import type {
  DispatchManyResult,
  DispatchResult,
} from '@boringnode/queue/types';

import { assertDefaultConnection } from './config.js';
import { createBoringQueueConfig } from './drivers.js';
import type {
  AppQueueConfig,
  AppQueueWorkerConfig,
  CreateQueueManagerOptions,
  NocoBaseQueueDispatchableJobClass,
  NocoBaseQueueJobClass,
  NocoBaseQueueManager,
  NocoBaseQueueWorker,
  QueueDispatchOptions,
} from './types.js';

let activeManagerId: symbol | undefined;

interface DispatchBuilder {
  toQueue(queue: string): this;
  with(connection: string): this;
  priority(priority: number): this;
  in(delay: NonNullable<QueueDispatchOptions['delay']>): this;
  group(groupId: string): this;
  dedup(options: NonNullable<QueueDispatchOptions['dedup']>): this;
  run(): Promise<DispatchResult>;
}

interface BatchDispatchBuilder {
  toQueue(queue: string): this;
  with(connection: string): this;
  priority(priority: number): this;
  group(groupId: string): this;
  run(): Promise<DispatchManyResult>;
}

export function createQueueManager(
  config: AppQueueConfig,
  managerOptions: CreateQueueManagerOptions = {},
): NocoBaseQueueManager {
  assertDefaultConnection(config);

  const managerId = Symbol('nocobase.queueManager');
  const workers = new Set<NocoBaseQueueWorker>();
  let initPromise: Promise<void> | undefined;
  let closePromise: Promise<void> | undefined;

  const init = async (): Promise<void> => {
    if (!initPromise) {
      initPromise = createBoringQueueConfig(config, managerOptions).then(
        async (boringConfig) => {
          await QueueManager.init(boringConfig);
          activeManagerId = managerId;
        },
      );
    }

    return initPromise;
  };

  return {
    init,

    use(name?: string): unknown {
      if (activeManagerId !== managerId || !QueueManager.isInitialized()) {
        throw new Error('Queue manager is not initialized.');
      }

      return QueueManager.use(name);
    },

    registerJob<T extends Job>(JobClass: NocoBaseQueueJobClass<T>): void {
      registerJob(JobClass);
    },

    async dispatch<T extends Job>(
      JobClass: NocoBaseQueueDispatchableJobClass<T>,
      payload: T extends Job<infer P> ? P : never,
      options?: QueueDispatchOptions,
    ) {
      await init();
      registerJob(JobClass);
      return applyDispatchOptions(
        JobClass.dispatch(payload) as DispatchBuilder,
        options,
      ).run();
    },

    async dispatchMany<T extends Job>(
      JobClass: NocoBaseQueueDispatchableJobClass<T>,
      payloads: Array<T extends Job<infer P> ? P : never>,
      options?: Omit<QueueDispatchOptions, 'delay' | 'dedup'>,
    ) {
      await init();
      registerJob(JobClass);
      return applyBatchDispatchOptions(
        JobClass.dispatchMany(payloads) as BatchDispatchBuilder,
        options,
      ).run();
    },

    createWorker(options?: AppQueueWorkerConfig): NocoBaseQueueWorker {
      const workerId = randomUUID();
      const workerConfig: AppQueueConfig = {
        ...config,
        worker: {
          ...config.worker,
          ...options,
          gracefulShutdown:
            options?.gracefulShutdown ??
            config.worker?.gracefulShutdown ??
            false,
        },
      };
      let worker: Worker | undefined;
      let workerConfigPromise:
        ReturnType<typeof createBoringQueueConfig> | undefined;
      const getWorker = async (): Promise<Worker> => {
        if (!workerConfigPromise) {
          workerConfigPromise = createBoringQueueConfig(
            workerConfig,
            managerOptions,
          );
        }

        worker ??= new Worker(await workerConfigPromise);
        return worker;
      };
      const wrapped: NocoBaseQueueWorker = {
        get id() {
          return worker?.id ?? workerId;
        },
        start: async (
          queues = options?.queues ?? config.worker?.queues ?? ['default'],
        ) => {
          activeManagerId = managerId;
          return (await getWorker()).start(queues);
        },
        stop: async () => {
          if (!worker) {
            return;
          }

          await worker.stop();
        },
      };

      workers.add(wrapped);
      return wrapped;
    },

    async close(): Promise<void> {
      if (!closePromise) {
        closePromise = (async () => {
          await Promise.all(Array.from(workers, (worker) => worker.stop()));
          workers.clear();

          if (activeManagerId === managerId && QueueManager.isInitialized()) {
            await QueueManager.destroy();
            activeManagerId = undefined;
          }
        })();
      }

      return closePromise;
    },
  };
}

function registerJob<T extends Job>(JobClass: NocoBaseQueueJobClass<T>): void {
  Locator.register(JobClass.options?.name ?? JobClass.name, JobClass);
}

function applyDispatchOptions(
  dispatcher: DispatchBuilder,
  options: QueueDispatchOptions | undefined,
): DispatchBuilder {
  if (!options) {
    return dispatcher;
  }

  let next = dispatcher;
  if (options.queue) {
    next = next.toQueue(options.queue);
  }
  if (options.connection) {
    next = next.with(options.connection);
  }
  if (options.priority !== undefined) {
    next = next.priority(options.priority);
  }
  if (options.delay !== undefined) {
    next = next.in(options.delay);
  }
  if (options.groupId) {
    next = next.group(options.groupId);
  }
  if (options.dedup) {
    next = next.dedup(options.dedup);
  }

  return next;
}

function applyBatchDispatchOptions(
  dispatcher: BatchDispatchBuilder,
  options: Omit<QueueDispatchOptions, 'delay' | 'dedup'> | undefined,
): BatchDispatchBuilder {
  if (!options) {
    return dispatcher;
  }

  let next = dispatcher;
  if (options.queue) {
    next = next.toQueue(options.queue);
  }
  if (options.connection) {
    next = next.with(options.connection);
  }
  if (options.priority !== undefined) {
    next = next.priority(options.priority);
  }
  if (options.groupId) {
    next = next.group(options.groupId);
  }

  return next;
}
