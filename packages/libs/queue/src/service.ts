import { Queue, Worker, WaitingError } from 'bullmq';
import type { IQueueBackend, QueueBaseOptions } from 'bullmq';
import { createBackendRegistry } from './backends/registry.js';
import { resolveRedisConnection } from './backends/redis.js';
import { resolveQueueConfiguration, resolveQueueTimeouts } from './config.js';
import { createQueueIdentity, validateQueueName } from './identity.js';
import { createQueueProducer } from './producer.js';
import { settlesWithin } from './lifecycle.js';
import { QueueCancellation } from './cancellation.js';
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
  cancellation: QueueCancellation;
  manual: QueueRuntimeOptions;
  queue?: ServiceQueue;
  worker?: ServiceWorker;
  initializeWorker?: () => Promise<void>;
  workerInitialization?: Promise<void>;
  initializationCancelled?: boolean;
  workerInitializationCancelled?: boolean;
  runtimeInitialization?: Promise<void>;
  configurationSettlement: () => Promise<void>;
}

export function createQueueService(
  options: QueueOptions,
  dependencies: QueueServiceDependencies = {},
): QueueService {
  const timeouts = resolveQueueTimeouts(options);
  const resources = new QueueResourceCache();
  let ready = false;
  const registry = createBackendRegistry();
  const entries = new Map<string, QueueEntry>();
  let setupStarted = false;
  let stopped = false;
  let setupPromise: Promise<void> | undefined;
  let shutdownPromise: Promise<void> | undefined;
  let producersOpen = true;
  const publishing = new Set<Promise<void>>();

  function entry(name: string): QueueEntry {
    validateQueueName(name, 'queue');
    if (stopped) throw new Error('Queue service is shutting down');
    const previous = entries.get(name);
    if (previous) return previous;
    const handlers = createQueueHandlerRegistry();
    const cancellation = new QueueCancellation();
    let configureTail: Promise<void> = Promise.resolve();
    const current: QueueEntry = {
      handlers,
      cancellation,
      configurationSettlement: () => configureTail,
      manual: {},
      manager: {
        configure(update): Promise<void> {
          const apply = async (): Promise<void> => {
            if (stopped) throw new Error('Queue service is shutting down');
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
            const config = resolveQueueConfiguration(options, name, next);
            if (setupStarted) await requireReady(name, current);
            current.manual = next;
            if (current.worker) current.worker.concurrency = config.concurrency;
            if (
              setupStarted &&
              current.queue &&
              update.rateLimit !== undefined
            ) {
              if (config.rateLimit === null)
                await current.queue.removeGlobalRateLimit();
              else if (config.rateLimit)
                await current.queue.setGlobalRateLimit(
                  config.rateLimit.max,
                  config.rateLimit.duration,
                );
            }
          };
          const operation = configureTail.then(apply);
          configureTail = operation.catch(() => {});
          return operation;
        },
        async drain(drainOptions): Promise<void> {
          await requireReady(name, current);
          if (!current.queue) throw new Error('Queue is not ready');
          await current.queue.drain(drainOptions?.delayed);
        },
        cancelJob(jobId, reason): boolean {
          return cancellation.cancelJob(jobId, reason);
        },
        cancelAllJobs(reason): void {
          cancellation.cancelAllJobs(reason);
        },
      },
      producer: createQueueProducer({
        name,
        beginOperation(): () => void {
          if (!producersOpen) throw new Error('Queue service is closed');
          let settle = (): void => {};
          const pending = new Promise<void>((resolve) => {
            settle = resolve;
          });
          publishing.add(pending);
          return (): void => {
            publishing.delete(pending);
            settle();
          };
        },
        async queue(): Promise<ServiceQueue> {
          if (!producersOpen) throw new Error('Queue service is closed');
          if (!stopped) await requireReady(name, current);
          else if (!ready) throw new Error('Queue is not ready');
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

  const workerCloseErrors = new WeakMap<ServiceWorker, unknown[]>();
  async function closeWorker(
    worker: ServiceWorker,
    force: boolean = false,
  ): Promise<void> {
    let errors = workerCloseErrors.get(worker);
    if (!errors) {
      errors = [];
      workerCloseErrors.set(worker, errors);
    }
    const observed = errors;
    const onError = (error: Error): void => {
      observed.push(error);
    };
    worker.on('error', onError);
    try {
      await worker.close(force);
    } finally {
      worker.off('error', onError);
    }
    if (observed.length)
      throw new AggregateError(observed, 'Queue Worker cleanup failed');
  }

  async function closeEntries(
    targets: Iterable<QueueEntry> = entries.values(),
    force: boolean = false,
  ): Promise<void> {
    const errors: unknown[] = [];
    await Promise.all(
      Array.from(targets, async (current) => {
        await Promise.all(
          (['worker', 'queue'] as const).map(async (key) => {
            const resource = current[key];
            if (!resource) return;
            try {
              if (key === 'worker' && current.worker)
                await closeWorker(current.worker, force);
              else await resource.close();
              if (current[key] === resource) current[key] = undefined;
            } catch (error) {
              errors.push(error);
            }
          }),
        );
      }),
    );
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
    current.runtimeInitialization ??= (async (): Promise<void> => {
      const initialization = initializeEntry(name, current);
      if (await settlesWithin(initialization, timeouts.setupTimeoutMs)) return;
      current.initializationCancelled = true;
      const timeout = new Error(
        `Queue ${name} initialization deadline exceeded`,
      );
      const cleanupDeadline = performance.now() + 5000;
      const cleanup = closeEntries([current]).catch((error: unknown) => {
        throw new AggregateError(
          [timeout, error],
          'Queue initialization and cleanup failed',
          { cause: timeout },
        );
      });
      if (!(await settlesWithin(cleanup, 5000)))
        throw new AggregateError(
          [timeout, new Error('Queue cleanup remains unresolved')],
          'Queue initialization failed',
        );
      if (
        !(await settlesWithin(
          initialization.then(
            () => {},
            () => {},
          ),
          Math.max(0, cleanupDeadline - performance.now()),
        ))
      )
        throw new AggregateError(
          [timeout, new Error('Queue cancellation is unconfirmed')],
          'Queue initialization failed',
        );
      throw timeout;
    })();
    await current.runtimeInitialization;
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
    if (stopped) throw new Error('Queue initialization was cancelled');
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
    const initialization = current.initializeWorker?.();
    if (
      initialization &&
      !(await settlesWithin(initialization, timeouts.setupTimeoutMs))
    ) {
      current.workerInitializationCancelled = true;
      const timeout = new Error(
        `Queue ${name} Worker initialization deadline exceeded`,
      );
      const deadline = performance.now() + 5000;
      if (current.worker) {
        const closing = closeWorker(current.worker, true).catch(
          (error: unknown) => {
            throw new AggregateError(
              [timeout, error],
              'Worker initialization and cleanup failed',
              { cause: timeout },
            );
          },
        );
        if (!(await settlesWithin(closing, 5000)))
          throw new AggregateError(
            [timeout, new Error('Worker cleanup remains unresolved')],
            'Worker initialization failed',
          );
      }
      if (
        !(await settlesWithin(
          initialization.then(
            () => {},
            () => {},
          ),
          Math.max(0, deadline - performance.now()),
        ))
      )
        throw new AggregateError(
          [timeout, new Error('Worker cancellation is unconfirmed')],
          'Worker initialization failed',
        );
      throw timeout;
    }
    if (
      stopped ||
      current.workerInitializationCancelled ||
      !current.handlers.size()
    )
      return;
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
        if (config.connection !== undefined && config.queueBackend !== 'redis')
          throw new Error('Queue connection adaptation is not implemented');
        const physicalName =
          config.queueBackend === 'postgres'
            ? identity.postgresQueueName
            : identity.redisQueueName;
        const base: QueueBaseOptions & { prefix: string } = {
          connection:
            config.queueBackend === 'redis'
              ? resolveRedisConnection(config.connection)
              : {},
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
        if (stopped || current.initializationCancelled)
          throw new Error('Queue initialization was cancelled');
        if (config.queueBackend === 'inMemory')
          dependencies.onInMemoryQueueInitialized?.({
            namespace: config.namespace,
            queue: name,
          });
        if (config.rateLimit === null)
          await current.queue.removeGlobalRateLimit();
        else if (config.rateLimit !== undefined)
          await current.queue.setGlobalRateLimit(
            config.rateLimit.max,
            config.rateLimit.duration,
          );
        if (stopped || current.initializationCancelled)
          throw new Error('Queue initialization was cancelled');
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
                if (stopped || current.handlers.size() === 0) {
                  await job.moveToWait(token);
                  throw new WaitingError();
                }
                if (!signal)
                  throw new Error(
                    'Queue Worker did not provide an abort signal',
                  );
                if (job.id === undefined)
                  throw new Error('Queue job has no ID');
                await current.cancellation.run(
                  job.id,
                  signal,
                  (dispatchSignal) =>
                    current.handlers.dispatch(
                      job.name,
                      decodeQueueMessage(job.data),
                      dispatchSignal,
                    ),
                );
              },
              {
                ...base,
                autorun: false,
                concurrency: resolveQueueConfiguration(
                  options,
                  name,
                  current.manual,
                ).concurrency,
              },
              factory,
            );
            current.worker.on('error', (error: Error) =>
              dependencies.logger?.error(
                { error, queue: name },
                'Queue worker error',
              ),
            );
            await current.worker.waitUntilReady();
            if (current.workerInitializationCancelled)
              throw new Error('Queue Worker initialization was cancelled');
          })().catch(async (error: unknown) => {
            try {
              if (current.worker) await closeWorker(current.worker);
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
    producer: (name): QueueProducer => {
      validateQueueName(name, 'queue');
      if (stopped && producersOpen) {
        const existing = entries.get(name);
        if (existing?.queue) return existing.producer;
      }
      return entry(name).producer;
    },
    consumer: (name): QueueConsumer => entry(name).consumer,
    setup(): Promise<void> {
      if (stopped)
        return Promise.reject(new Error('Queue service is shutting down'));
      if (setupPromise) return setupPromise;
      setupStarted = true;
      registry.freeze();
      const initialization = initialize();
      setupPromise = (async (): Promise<void> => {
        if (await settlesWithin(initialization, timeouts.setupTimeoutMs))
          return;
        stopped = true;
        producersOpen = false;
        const timeout = new Error('Queue setup deadline exceeded');
        const cleanupDeadline = performance.now() + 5000;
        const cleanup = closeEntries().catch((error: unknown) => {
          throw new AggregateError(
            [timeout, error],
            'Queue setup and cleanup failed',
            { cause: timeout },
          );
        });
        if (!(await settlesWithin(cleanup, 5000))) {
          dependencies.logger?.error(
            { error: timeout },
            'Queue setup cleanup remains unresolved',
          );
          throw new AggregateError(
            [timeout, new Error('Queue setup cleanup deadline exceeded')],
            'Queue setup failed',
          );
        }
        const settlement = initialization.then(
          () => {},
          () => {},
        );
        if (
          !(await settlesWithin(
            settlement,
            Math.max(0, cleanupDeadline - performance.now()),
          ))
        ) {
          dependencies.logger?.error(
            { error: timeout },
            'Queue initialization remains unresolved after cleanup',
          );
          throw new AggregateError(
            [
              timeout,
              new Error('Queue initialization cancellation is unconfirmed'),
            ],
            'Queue setup failed',
          );
        }
        throw timeout;
      })().catch(async (error: unknown) => {
        if (stopped) throw error;
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
    shutdown(): Promise<void> {
      if (shutdownPromise) return shutdownPromise;
      stopped = true;
      shutdownPromise = (async (): Promise<void> => {
        const paused = Promise.allSettled(
          [...entries.values()].flatMap((current) =>
            current.worker ? [current.worker.pause(true)] : [],
          ),
        );
        const drainDeadline = performance.now() + timeouts.shutdownTimeoutMs;
        const preparation = (async (): Promise<void> => {
          if (setupPromise) await setupPromise.catch(() => {});
          await Promise.all(
            [...entries.values()].map((current) =>
              current.configurationSettlement(),
            ),
          );
          await resources.settle();
          await Promise.allSettled(
            [...entries.values()].flatMap((current) =>
              current.workerInitialization
                ? [current.workerInitialization]
                : [],
            ),
          );
        })();
        const prepared = await settlesWithin(
          preparation,
          timeouts.shutdownTimeoutMs,
        );
        const errors: unknown[] = [];
        if (
          await settlesWithin(
            paused,
            Math.max(0, drainDeadline - performance.now()),
          )
        ) {
          for (const result of await paused)
            if (result.status === 'rejected') errors.push(result.reason);
        } else errors.push(new Error('Queue consumer pause deadline exceeded'));
        if (!prepared)
          errors.push(
            new Error('Queue shutdown preparation deadline exceeded'),
          );
        const workers = [...entries.values()].filter(
          (current) => current.worker,
        );
        const waiting = Promise.allSettled(
          workers.map(async (current) => {
            await current.worker!.pause(false);
            await current.handlers.settle();
          }),
        );
        let settled = await settlesWithin(
          waiting,
          Math.max(0, drainDeadline - performance.now()),
        );
        if (!settled) {
          for (const current of workers)
            current.worker?.cancelAllJobs('Queue service shutdown');
          settled = await settlesWithin(waiting, timeouts.cancellationGraceMs);
        }
        if (!settled) {
          const error = new Error(
            'Queue shutdown grace expired; handlers may still be running',
          );
          errors.push(error);
          dependencies.logger?.error(
            { error },
            'Queue shutdown has unresolved handlers',
          );
          void waiting.then(() =>
            dependencies.logger?.warn(
              {},
              'Previously unresolved queue handlers have settled',
            ),
          );
        } else {
          for (const result of await waiting)
            if (result.status === 'rejected') errors.push(result.reason);
        }
        producersOpen = false;
        const publications = Promise.all([...publishing]);
        const published = await settlesWithin(
          publications,
          Math.max(0, drainDeadline - performance.now()),
        );
        if (!published)
          errors.push(
            new Error('Queue shutdown publication deadline exceeded'),
          );
        const cleanupDeadline = performance.now() + 5000;
        const cleanup = closeEntries(entries.values(), !settled);
        try {
          if (!(await settlesWithin(cleanup, 5000))) {
            const error = new Error(
              'Queue resource cleanup deadline exceeded; resources remain unresolved',
            );
            errors.push(error);
            dependencies.logger?.error(
              { error },
              'Queue shutdown has unresolved resources',
            );
            void cleanup.then(
              () =>
                dependencies.logger?.warn(
                  {},
                  'Previously unresolved queue resources have closed',
                ),
              (error: unknown) =>
                dependencies.logger?.error(
                  { error },
                  'Previously unresolved queue cleanup failed',
                ),
            );
          }
        } catch (error) {
          errors.push(error);
        }
        if (
          !prepared &&
          !(await settlesWithin(
            preparation,
            Math.max(0, cleanupDeadline - performance.now()),
          ))
        ) {
          const error = new Error(
            'Queue shutdown preparation cancellation remains unconfirmed',
          );
          errors.push(error);
          dependencies.logger?.error(
            { error },
            'Queue shutdown has unresolved initialization or configuration',
          );
          void preparation.then(
            () =>
              dependencies.logger?.warn(
                {},
                'Previously unresolved queue initialization or configuration has settled',
              ),
            (error: unknown) =>
              dependencies.logger?.error(
                { error },
                'Previously unresolved queue initialization or configuration failed',
              ),
          );
        }
        if (
          !published &&
          !(await settlesWithin(
            publications,
            Math.max(0, cleanupDeadline - performance.now()),
          ))
        ) {
          const error = new Error(
            'Queue shutdown publication cancellation remains unconfirmed',
          );
          errors.push(error);
          dependencies.logger?.error(
            { error },
            'Queue shutdown has unresolved publications',
          );
          void publications.then(
            () =>
              dependencies.logger?.warn(
                {},
                'Previously unresolved queue publications have settled',
              ),
            (error: unknown) =>
              dependencies.logger?.error(
                { error },
                'Previously unresolved queue publications failed',
              ),
          );
        }
        if (errors.length)
          throw new AggregateError(errors, 'Queue shutdown failed');
      })();
      return shutdownPromise;
    },
  };
}
