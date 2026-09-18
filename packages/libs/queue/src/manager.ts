import { randomUUID } from 'node:crypto';

import { Job, Locator, QueueManager, Worker } from '@boringnode/queue';
import type {
  Adapter,
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
  NocoBaseQueueScheduleStore,
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

    schedules(queue = 'default'): NocoBaseQueueScheduleStore {
      const connection = resolveQueueConnection(config, queue);
      const configured = config.connections[connection];
      if (configured?.driver === 'sync') {
        throw new Error(
          `Queue "${queue}" uses the "${connection}" sync connection, which does not support scheduled jobs.`,
        );
      }
      const adapter = (): Adapter => {
        if (activeManagerId !== managerId || !QueueManager.isInitialized()) {
          throw new Error('Queue manager is not initialized.');
        }
        return QueueManager.use(connection);
      };
      return {
        upsert: (schedule) => adapter().upsertSchedule(schedule),
        get: (id) => adapter().getSchedule(id),
        list: (options) => adapter().listSchedules(options),
        update: (id, updates) => adapter().updateSchedule(id, updates),
        delete: (id) => adapter().deleteSchedule(id),
      };
    },

    createWorker(options?: AppQueueWorkerConfig): NocoBaseQueueWorker {
      const workerId = randomUUID();
      const queues = options?.queues ?? config.worker?.queues ?? ['default'];
      const explicitConnection =
        options?.connection ?? config.worker?.connection;
      let connection: string | undefined;
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
      const getWorker = async (selectedConnection: string): Promise<Worker> => {
        if (!workerConfigPromise) {
          workerConfigPromise = createBoringQueueConfig(
            {
              ...workerConfig,
              worker: {
                ...workerConfig.worker,
                connection: selectedConnection,
              },
            },
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
        start: async (selectedQueues = queues) => {
          const selectedConnection = resolveWorkerConnection(
            config,
            selectedQueues,
            explicitConnection,
          );
          if (connection !== undefined && selectedConnection !== connection) {
            throw new Error(
              `Worker connection "${connection}" cannot consume queues [${selectedQueues.join(', ')}] from connection "${selectedConnection}".`,
            );
          }
          connection = selectedConnection;
          activeManagerId = managerId;
          return (await getWorker(selectedConnection)).start(selectedQueues);
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

function resolveQueueConnection(config: AppQueueConfig, queue: string): string {
  const connection = config.queues?.[queue]?.connection ?? config.default;
  if (!config.connections[connection]) {
    throw new Error(
      `Queue "${queue}" references unconfigured connection "${connection}".`,
    );
  }
  return connection;
}

function resolveWorkerConnection(
  config: AppQueueConfig,
  queues: readonly string[],
  explicitConnection?: string,
): string {
  const connections = new Set(
    explicitConnection !== undefined
      ? [explicitConnection]
      : queues.map((queue) => resolveQueueConnection(config, queue)),
  );
  if (connections.size !== 1) {
    throw new Error(
      `A worker can only consume queues from one connection; queues [${queues.join(', ')}] resolve to [${[...connections].join(', ')}].`,
    );
  }
  const connection = [...connections][0];
  if (!config.connections[connection]) {
    throw new Error(
      `Worker references unconfigured connection "${connection}".`,
    );
  }
  return connection;
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
