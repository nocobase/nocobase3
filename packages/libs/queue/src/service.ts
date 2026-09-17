import { Queue, Worker } from 'bullmq';
import type { IQueueBackend, QueueBaseOptions } from 'bullmq';
import { createBackendRegistry } from './backends/registry.js';
import { resolveQueueConfiguration } from './config.js';
import { createQueueIdentity, validateQueueName } from './identity.js';
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
  handlers: Set<ConsumeHandler<never>>;
  manual: QueueRuntimeOptions;
  queue?: ServiceQueue;
  worker?: ServiceWorker;
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
    const handlers = new Set<ConsumeHandler<never>>();
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
      producer: {
        async publish(): Promise<PublishReceipt> {
          await requireReady(name, current);
          throw new Error('Queue publishing is not implemented');
        },
        async publishMany(): Promise<PublishReceipt[]> {
          await requireReady(name, current);
          throw new Error('Queue publishing is not implemented');
        },
      },
      consumer: {
        consume(handler): UnregisterHandler {
          if (stopped) throw new Error('Queue service is shutting down');
          // Each registration owns a distinct wrapper, even for the same function.
          const registration: ConsumeHandler<never> = (
            channel,
            message,
            signal,
          ) => handler(channel, message, signal);
          handlers.add(registration);
          return async (): Promise<void> => {
            handlers.delete(registration);
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
        if (current.handlers.size) {
          current.worker = new Worker<unknown, unknown, string, IQueueBackend>(
            physicalName,
            async () => {
              throw new Error('Queue dispatch is not implemented');
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
        }
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
      await closeEntries();
    },
  };
}
