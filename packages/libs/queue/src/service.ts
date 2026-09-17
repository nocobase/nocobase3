import { Queue, Worker, WaitingError } from 'bullmq';
import type { IQueueBackend, QueueBaseOptions } from 'bullmq';
import { createBackendRegistry } from './backends/registry.js';
import { resolveQueueConfiguration } from './config.js';
import { createQueueIdentity, validateQueueName } from './identity.js';
import { createQueueProducer } from './producer.js';
import { createQueueHandlerRegistry } from './consumer.js';
import type { QueueHandlerRegistry } from './consumer.js';
import { decodeQueueMessage } from './serialization.js';
import { QueueResourceCache } from './resources.js';
import type { BackendFactory } from 'bullmq';
import type {
  QueueOptions,
  QueueRuntimeOptions,
  PublishOptions,
} from './types.js';

/** Temporary name while the legacy QueueManager export remains in use. */
export interface QueueServiceManager {
  configure(options: QueueRuntimeOptions): Promise<void>;
  drain(options?: { delayed?: boolean }): Promise<void>;
  cancelJob(jobId: string, reason?: string): boolean;
  cancelAllJobs(reason?: string): void;
}

export interface PublishReceipt {
  jobId: string;
}

export interface QueueProducer {
  publish(
    channel: string,
    message: unknown,
    options?: PublishOptions,
  ): Promise<PublishReceipt>;
  publishMany(
    batches: { channel: string; message: unknown }[],
    options?: PublishOptions,
  ): Promise<PublishReceipt[]>;
}

export type ConsumeHandler<T = unknown> = (
  channel: string,
  message: T,
  signal: AbortSignal,
) => Promise<void>;
export type UnregisterHandler = () => Promise<void>;
export interface QueueConsumer {
  consume<T = unknown>(handler: ConsumeHandler<T>): UnregisterHandler;
}

export interface QueueService {
  registerBackend(name: string, factory: BackendFactory): void;
  manager(queue: string): QueueServiceManager;
  producer(queue: string): QueueProducer;
  consumer(queue: string): QueueConsumer;
  setup(): Promise<void>;
  shutdown(): Promise<void>;
}

export interface QueueServiceDependencies {
  logger?: {
    warn(context: Record<string, unknown>, message: string): void;
    error(context: Record<string, unknown>, message: string): void;
  };
  onInMemoryQueueInitialized?: (identity: {
    namespace: string;
    queue: string;
  }) => void;
}

type ServiceQueue = Queue<
  unknown,
  unknown,
  string,
  unknown,
  unknown,
  string,
  IQueueBackend
>;
type ServiceWorker = Worker<unknown, unknown, string, IQueueBackend>;

interface QueueEntry {
  manager: QueueServiceManager;
  producer: QueueProducer;
  consumer: QueueConsumer;
  handlers: QueueHandlerRegistry;
  manual: QueueRuntimeOptions;
  queue?: ServiceQueue;
  worker?: ServiceWorker;
  initializeWorker?: () => Promise<void>;
  workerInitialization?: Promise<void>;
}

export function createQueueService(
  options: QueueOptions,
  dependencies: QueueServiceDependencies = {},
): QueueService {
  const resources = new QueueResourceCache();
  let ready = false;
  const registry = createBackendRegistry();
  const entries = new Map<string, QueueEntry>();
  let setupStarted = false;
  let stopped = false;
  let setupPromise: Promise<void> | undefined;

  function entry(name: string): QueueEntry {
    validateQueueName(name, 'queue');
    if (stopped) throw new Error('Queue service is shutting down');
    const previous = entries.get(name);
    if (previous) return previous;
    const handlers = createQueueHandlerRegistry();
    const current: QueueEntry = {
      handlers,
      manual: {},
      manager: {
        async configure(update): Promise<void> {
          const next = { ...current.manual };
          for (const [key, value] of Object.entries(update)) {
            if (value !== undefined)
              Object.defineProperty(next, key, {
                value,
                enumerable: true,
                writable: true,
                configurable: true,
              });
          }
          resolveQueueConfiguration(options, name, next);
          if (setupStarted)
            throw new Error('Runtime queue configuration is not implemented');
          current.manual = next;
        },
        async drain(drainOptions): Promise<void> {
          await requireReady(name, current);
          if (!current.queue) throw new Error('Queue is not ready');
          await current.queue.drain(drainOptions?.delayed);
        },
        cancelJob(jobId, reason): boolean {
          return current.worker?.cancelJob(jobId, reason) ?? false;
        },
        cancelAllJobs(reason): void {
          current.worker?.cancelAllJobs(reason);
        },
      },
      producer: createQueueProducer({
        name,
        async queue(): Promise<ServiceQueue> {
          await requireReady(name, current);
          if (!current.queue) throw new Error('Queue is not ready');
          return current.queue;
        },
        configuration: () =>
          resolveQueueConfiguration(options, name, current.manual),
      }),
      consumer: {
        consume(handler): UnregisterHandler {
          if (stopped) throw new Error('Queue service is shutting down');
          const unregister = handlers.consume(handler);
          if (ready && !current.worker) {
            void activateWorker(name, current).catch((error: unknown) => {
              dependencies.logger?.error(
                { error, queue: name },
                'Queue worker activation failed',
              );
            });
          }
          if (ready && current.worker?.isPaused()) {
            void current.worker.resume().catch((error: unknown) => {
              dependencies.logger?.error(
                { error, queue: name },
                'Queue worker resume failed',
              );
            });
          }
          return async (): Promise<void> => {
            const settled = unregister();
            if (handlers.size() === 0 && current.worker) {
              await Promise.all([current.worker.pause(true), settled]);
            } else {
              await settled;
            }
          };
        },
      },
    };
    entries.set(name, current);
    return current;
  }

  async function closeEntries(
    targets: Iterable<QueueEntry> = entries.values(),
  ): Promise<void> {
    const errors: unknown[] = [];
    for (const current of targets) {
      for (const key of ['worker', 'queue'] as const) {
        const resource = current[key];
        if (!resource) continue;
        try {
          await resource.close();
          current[key] = undefined;
        } catch (error) {
          errors.push(error);
        }
      }
    }
    if (errors.length)
      throw new AggregateError(errors, 'Queue resource cleanup failed');
  }

  async function requireReady(
    name: string,
    current: QueueEntry,
  ): Promise<void> {
    if (stopped) throw new Error('Queue service is shutting down');
    if (!setupPromise) throw new Error('Queue is not ready');
    await setupPromise;
    if (!ready || stopped) throw new Error('Queue is not ready');
    await initializeEntry(name, current);
    if (stopped) throw new Error('Queue service is shutting down');
  }

  async function initialize(): Promise<void> {
    const defaults = resolveQueueConfiguration(options, '__defaults__');
    validateQueueName(defaults.namespace, 'namespace');
    registry.resolve(defaults.queueBackend);
    for (const name of new Set([
      ...Object.keys(options.queues ?? {}),
      ...entries.keys(),
    ])) {
      const config = resolveQueueConfiguration(
        options,
        name,
        entries.get(name)?.manual,
      );
      createQueueIdentity(config.namespace, name);
      registry.resolve(config.queueBackend);
    }
    for (const [name, current] of entries) await initializeEntry(name, current);
    ready = true;
    for (const [name, current] of entries) {
      if (current.worker) {
        void current.worker.run().catch((error: unknown) => {
          dependencies.logger?.error(
            { error, queue: name },
            'Queue worker run failed',
          );
        });
      }
    }
  }

  async function activateWorker(
    name: string,
    current: QueueEntry,
  ): Promise<void> {
    await requireReady(name, current);
    if (!current.handlers.size()) return;
    await current.initializeWorker?.();
    if (stopped || !current.handlers.size()) return;
    if (current.worker && !current.worker.isRunning()) {
      void current.worker.run().catch((error: unknown) => {
        dependencies.logger?.error(
          { error, queue: name },
          'Queue worker run failed',
        );
      });
    }
  }

  function initializeEntry(name: string, current: QueueEntry): Promise<void> {
    return resources.initialize(name, async () => {
      if (stopped) throw new Error('Queue service is shutting down');
      try {
        const config = resolveQueueConfiguration(options, name, current.manual);
        const factory = registry.resolve(config.queueBackend);
        const identity = createQueueIdentity(config.namespace, name);
        // Connection adapters are introduced by the resource/backend slices; never silently discard one.
        if (config.connection !== undefined)
          throw new Error('Queue connection adaptation is not implemented');
        const physicalName =
          config.queueBackend === 'postgres'
            ? identity.postgresQueueName
            : identity.redisQueueName;
        const base: QueueBaseOptions & { prefix: string } = {
          connection: {},
          prefix: identity.redisPrefix,
        };
        current.queue = new Queue<
          unknown,
          unknown,
          string,
          unknown,
          unknown,
          string,
          IQueueBackend
        >(physicalName, base, factory);
        current.queue.on('error', (error: Error) =>
          dependencies.logger?.error(
            { error, queue: name },
            'Queue backend error',
          ),
        );
        await current.queue.waitUntilReady();
        current.initializeWorker = (): Promise<void> => {
          current.workerInitialization ??= (async (): Promise<void> => {
            if (stopped) throw new Error('Queue service is shutting down');
            current.worker = new Worker<
              unknown,
              unknown,
              string,
              IQueueBackend
            >(
              physicalName,
              async (job, token, signal): Promise<void> => {
                if (current.handlers.size() === 0) {
                  await job.moveToWait(token);
                  throw new WaitingError();
                }
                if (!signal)
                  throw new Error(
                    'Queue Worker did not provide an abort signal',
                  );
                await current.handlers.dispatch(
                  job.name,
                  decodeQueueMessage(job.data),
                  signal,
                );
              },
              { ...base, autorun: false, concurrency: config.concurrency },
              factory,
            );
            current.worker.on('error', (error: Error) =>
              dependencies.logger?.error(
                { error, queue: name },
                'Queue worker error',
              ),
            );
            await current.worker.waitUntilReady();
          })().catch(async (error: unknown) => {
            try {
              await current.worker?.close();
              current.worker = undefined;
            } catch (cleanup) {
              throw new AggregateError(
                [error, cleanup],
                'Queue Worker initialization and cleanup failed',
                { cause: cleanup },
              );
            }
            throw error;
          });
          return current.workerInitialization;
        };
        if (current.handlers.size()) await current.initializeWorker();
      } catch (error) {
        try {
          await closeEntries([current]);
        } catch (cleanup) {
          throw new AggregateError(
            [error, cleanup],
            'Queue initialization and cleanup failed',
            { cause: cleanup },
          );
        }
        throw error;
      }
    });
  }

  return {
    registerBackend: (name, factory): void => registry.register(name, factory),
    manager: (name): QueueServiceManager => entry(name).manager,
    producer: (name): QueueProducer => entry(name).producer,
    consumer: (name): QueueConsumer => entry(name).consumer,
    setup(): Promise<void> {
      if (stopped)
        return Promise.reject(new Error('Queue service is shutting down'));
      if (setupPromise) return setupPromise;
      setupStarted = true;
      registry.freeze();
      setupPromise = initialize().catch(async (error: unknown) => {
        try {
          await closeEntries();
        } catch (cleanup) {
          throw new AggregateError(
            [error, cleanup],
            'Queue setup and cleanup failed',
            { cause: cleanup },
          );
        }
        throw error;
      });
      return setupPromise;
    },
    async shutdown(): Promise<void> {
      stopped = true;
      if (setupPromise) await setupPromise.catch(() => {});
      await resources.settle();
      await Promise.allSettled(
        [...entries.values()].flatMap((current) =>
          current.workerInitialization ? [current.workerInitialization] : [],
        ),
      );
      await closeEntries();
    },
  };
}
