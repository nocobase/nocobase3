import { producerDeadline } from './operation-deadline.js';
import { createQueueDiagnostics } from './diagnostics.js';
import { postgresDeadline } from './backends/postgres-pool.js';
import { Queue, Worker, WaitingError } from 'bullmq';
import type { IQueueBackend, QueueBaseOptions } from 'bullmq';
import { createBackendRegistry } from './backends/registry.js';
import { resolveRedisConnection } from './backends/redis.js';
import { resolvePostgresConnection } from './backends/postgres.js';
import { createPostgresMigrationResource } from './backends/postgres-migrations.js';
import type { PostgresMigrationResource } from './backends/postgres-migrations.js';
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

export interface QueueManager {
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
  manager(queue: string): QueueManager;
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
  manager: QueueManager;
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
  const originalDependencies = dependencies;
  const diagnostics = createQueueDiagnostics(dependencies.logger);
  dependencies = {
    ...dependencies,
    logger: diagnostics,
    onInMemoryQueueInitialized: (identity): void => {
      try {
        originalDependencies.onInMemoryQueueInitialized?.(identity);
      } catch (error) {
        diagnostics.warn(
          { ...identity, error },
          'Queue memory diagnostic hook failed',
        );
      }
    },
  };
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
  const migrations = new Set<PostgresMigrationResource>();
  const migratedPostgresTargets = new Set<string>();
  const closes = new WeakMap<object, Promise<void>>();
  let serviceCleanupDeadline: number | undefined;

  function cleanupDeadline(): number {
    return (serviceCleanupDeadline ??= performance.now() + 5000);
  }

  function runWorker(name: string, current: QueueEntry): void {
    if (!current.worker || current.worker.isRunning()) return;
    const worker = current.worker;
    void producerDeadline
      .exit(() => postgresDeadline.exit(() => worker.run()))
      .catch((error: unknown) => {
        dependencies.logger?.error(
          { error, queue: name },
          'Queue worker run failed',
        );
      });
  }

  function closeOnce(
    resource: object,
    close: () => Promise<void>,
  ): Promise<void> {
    let pending = closes.get(resource);
    if (!pending) {
      pending = Promise.resolve().then(close);
      closes.set(resource, pending);
    }
    return pending;
  }

  async function initializeWithin(
    initialization: Promise<void>,
    timeoutMessage: string,
    cancel: () => void,
    cleanup: () => Promise<void>,
    reserve: () => number = () => performance.now() + 5000,
  ): Promise<void> {
    let failure: unknown;
    try {
      const remaining = Math.max(
        0,
        Math.min(
          timeouts.setupTimeoutMs,
          (producerDeadline.getStore() ?? Infinity) - performance.now(),
        ),
      );
      if (await settlesWithin(initialization, remaining)) return;
      failure = new Error(timeoutMessage);
    } catch (error) {
      failure = error;
    }
    cancel();
    const deadline = reserve();
    const errors: unknown[] = [failure];
    const closing = cleanup();
    try {
      if (
        !(await settlesWithin(
          closing,
          Math.max(0, deadline - performance.now()),
        ))
      ) {
        errors.push(
          new Error(
            'Queue cleanup deadline exceeded; resources remain unresolved',
          ),
        );
        void closing.then(
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
      !(await settlesWithin(
        initialization.then(
          () => {},
          () => {},
        ),
        Math.max(0, deadline - performance.now()),
      ))
    )
      errors.push(
        new Error('Queue initialization cancellation is unconfirmed'),
      );
    if (errors.length > 1)
      throw new AggregateError(
        errors,
        'Queue initialization and cleanup failed',
        { cause: failure },
      );
    throw failure;
  }

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
    const migrationCleanup = Promise.all(
      [...migrations].map(async (resource) => {
        try {
          await closeOnce(resource, () => resource.close());
          migrations.delete(resource);
        } catch (error) {
          errors.push(error);
        }
      }),
    );
    await Promise.all(
      Array.from(targets, async (current) => {
        await Promise.all(
          (['worker', 'queue'] as const).map(async (key) => {
            const resource = current[key];
            if (!resource) return;
            try {
              if (key === 'worker' && current.worker) {
                const worker = current.worker;
                await closeOnce(worker, () => closeWorker(worker, force));
              } else await closeOnce(resource, () => resource.close());
              if (current[key] === resource) current[key] = undefined;
            } catch (error) {
              errors.push(error);
            }
          }),
        );
      }),
    );
    await migrationCleanup;
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
    current.runtimeInitialization ??= initializeWithin(
      initializeEntry(name, current),
      `Queue ${name} initialization deadline exceeded`,
      () => {
        current.initializationCancelled = true;
      },
      () => closeEntries([current], true),
    );
    await current.runtimeInitialization;
    if (stopped) throw new Error('Queue service is shutting down');
  }

  async function initialize(): Promise<void> {
    const deadline = performance.now() + timeouts.setupTimeoutMs;
    const defaults = resolveQueueConfiguration(options, undefined);
    validateQueueName(defaults.namespace, 'namespace');
    registry.resolve(defaults.queueBackend);
    if (defaults.queueBackend === 'redis')
      resolveRedisConnection(defaults.connection);
    if (defaults.queueBackend === 'postgres')
      resolvePostgresConnection(defaults.connection);
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
      if (config.queueBackend === 'redis')
        resolveRedisConnection(config.connection);
      if (config.queueBackend === 'postgres')
        resolvePostgresConnection(config.connection);
    }
    const migrationTargets = [
      defaults,
      ...[
        ...new Set([...Object.keys(options.queues ?? {}), ...entries.keys()]),
      ].map((name) =>
        resolveQueueConfiguration(options, name, entries.get(name)?.manual),
      ),
    ];
    for (const target of migrationTargets) {
      if (stopped) throw new Error('Queue initialization was cancelled');
      if (target.queueBackend !== 'postgres') continue;
      const resource = createPostgresMigrationResource(
        resolvePostgresConnection(target.connection),
        deadline,
        migratedPostgresTargets,
      );
      migrations.add(resource);
      await resource.run();
      await closeOnce(resource, () => resource.close());
      migrations.delete(resource);
    }
    // Registrations may arrive while any initialization awaits readiness. Reconcile
    // until a synchronous pass finds no missing queue or handler-bearing Worker.
    for (;;) {
      for (const [name, current] of entries) {
        await postgresDeadline.run(deadline, async () => {
          await initializeEntry(name, current);
          if (current.handlers.size()) await current.initializeWorker?.();
        });
      }
      if (stopped) throw new Error('Queue initialization was cancelled');
      if (
        [...entries.values()].every(
          (current) =>
            current.queue && (!current.handlers.size() || current.worker),
        )
      )
        break;
    }
    ready = true;
    for (const [name, current] of entries) runWorker(name, current);
  }

  async function activateWorker(
    name: string,
    current: QueueEntry,
  ): Promise<void> {
    await requireReady(name, current);
    if (!current.handlers.size()) return;
    const initialization = current.initializeWorker?.();
    if (initialization)
      await initializeWithin(
        initialization,
        `Queue ${name} Worker initialization deadline exceeded`,
        () => {
          current.workerInitializationCancelled = true;
        },
        async () => {
          const worker = current.worker;
          if (worker) await closeOnce(worker, () => closeWorker(worker, true));
        },
      );
    if (
      stopped ||
      current.workerInitializationCancelled ||
      !current.handlers.size()
    )
      return;
    runWorker(name, current);
  }

  function initializeEntry(name: string, current: QueueEntry): Promise<void> {
    return postgresDeadline.run(
      Math.min(
        postgresDeadline.getStore() ?? Infinity,
        producerDeadline.getStore() ?? Infinity,
        performance.now() + timeouts.setupTimeoutMs,
      ),
      () =>
        resources.initialize(name, async () => {
          if (stopped) throw new Error('Queue service is shutting down');
          // Failure cleanup belongs to the bounded admission owner, not this task.
          const config = resolveQueueConfiguration(
            options,
            name,
            current.manual,
          );
          const registeredFactory = registry.resolve(config.queueBackend);
          const factory: BackendFactory = [
            'redis',
            'postgres',
            'inMemory',
          ].includes(config.queueBackend)
            ? registeredFactory
            : (physicalName, backendOptions, metadata) => {
                // BullMQ types only its built-in connection union. Custom factories own
                // the opaque connection contract; BullMQ itself receives no custom transport.
                const customOptions = {
                  ...backendOptions,
                  connection: config.connection,
                } as QueueBaseOptions;
                return registeredFactory(physicalName, customOptions, metadata);
              };
          const identity = createQueueIdentity(config.namespace, name);
          const physicalName =
            config.queueBackend === 'postgres'
              ? identity.postgresQueueName
              : identity.redisQueueName;
          const base: QueueBaseOptions & { prefix: string } = {
            connection:
              config.queueBackend === 'redis'
                ? resolveRedisConnection(config.connection)
                : config.queueBackend === 'postgres'
                  ? {
                      ...resolvePostgresConnection(config.connection),
                      migrate: false,
                    }
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
          >(physicalName, { ...base, skipMetasUpdate: true }, factory);
          current.queue.on('error', (error: Error) =>
            dependencies.logger?.error(
              { error, queue: name },
              'Queue backend error',
            ),
          );
          await current.queue.waitUntilReady();
          // Own metadata readiness explicitly: BullMQ's constructor suppresses failures.
          await current.queue
            .getBackend()
            .setQueueMeta(current.queue.metaValues);
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
            current.workerInitialization ??= postgresDeadline.run(
              postgresDeadline.getStore() ??
                performance.now() + timeouts.setupTimeoutMs,
              async (): Promise<void> => {
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
              },
            );
            return current.workerInitialization;
          };
          if (current.handlers.size()) await current.initializeWorker();
        }),
    );
  }

  return {
    registerBackend: (name, factory): void => registry.register(name, factory),
    manager: (name): QueueManager => entry(name).manager,
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
      setupPromise = initializeWithin(
        initialization,
        'Queue setup deadline exceeded',
        () => {
          stopped = true;
          producersOpen = false;
        },
        () => closeEntries(entries.values(), true),
        cleanupDeadline,
      );
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
            await current.worker!.backend.disconnectBlocking(true);
            await current.handlers.settle();
          }),
        );
        const waitForWorkers = async (
          milliseconds: number,
        ): Promise<boolean> => {
          const deadline = performance.now() + milliseconds;
          if (!(await settlesWithin(waiting, milliseconds))) return false;
          // pause(false) is a no-op after pause(true). A handler can also have
          // returned while its completion/failure/requeue is still pending. The
          // public running state covers both initial and resume-created run loops.
          // Observe it before close(false), whose memoized promise cannot later
          // be upgraded to force. This bounded poll leaves no timer after expiry.
          while (workers.some((current) => current.worker?.isRunning())) {
            const remaining = deadline - performance.now();
            if (remaining <= 0) return false;
            await new Promise<void>((resolve) =>
              setTimeout(resolve, Math.min(10, remaining)),
            );
          }
          return true;
        };
        let settled = await waitForWorkers(
          Math.max(0, drainDeadline - performance.now()),
        );
        if (!settled) {
          for (const current of workers)
            current.worker?.cancelAllJobs('Queue service shutdown');
          settled = await waitForWorkers(timeouts.cancellationGraceMs);
        }
        if (!settled) {
          const error = new Error(
            'Queue shutdown grace expired; handlers or job transitions may still be running',
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
        const deadline = cleanupDeadline();
        const cleanup = closeEntries(entries.values(), !settled);
        try {
          if (
            !(await settlesWithin(
              cleanup,
              Math.max(0, deadline - performance.now()),
            ))
          ) {
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
            Math.max(0, deadline - performance.now()),
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
            Math.max(0, deadline - performance.now()),
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
