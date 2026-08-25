import { fake } from '@boringnode/queue/drivers/fake_adapter';
import { KnexAdapter } from '@boringnode/queue/drivers/knex_adapter';
import { redis } from '@boringnode/queue/drivers/redis_adapter';
import { sync } from '@boringnode/queue/drivers/sync_adapter';
import type {
  AdapterFactory,
  QueueManagerConfig,
} from '@boringnode/queue/types';
import type { Knex } from 'knex';

import type {
  AppQueueConfig,
  AppQueueConnectionConfig,
  AppQueueDatabaseConnectionConfig,
  AppQueueNamedQueueConfig,
  CreateQueueManagerOptions,
  NocoBaseQueueLogger,
} from './types.js';

export async function createBoringQueueConfig(
  config: AppQueueConfig,
  options: CreateQueueManagerOptions = {},
): Promise<QueueManagerConfig> {
  return {
    default: config.default,
    adapters: await createAdapterFactories(
      selectActiveConnections(config),
      options,
    ),
    retry: config.retry,
    defaultJobOptions: config.defaultJobOptions,
    queues: mapQueues(config.queues),
    worker: mapWorker(config.worker),
    locations: config.jobs?.locations ?? [],
    autoLoadJobs: config.jobs?.autoLoad ?? true,
    hotReload: config.jobs?.hotReload ?? false,
    logger: options.logger ? createBoringLogger(options.logger) : undefined,
    jobFactory: options.jobFactory as QueueManagerConfig['jobFactory'],
  };
}

function selectActiveConnections(
  config: AppQueueConfig,
): Record<string, AppQueueConnectionConfig> {
  const activeConnectionNames = new Set<string>(
    [
      config.default,
      config.worker?.connection,
      ...Object.values(config.queues ?? {}).map((queue) => queue.connection),
    ].filter((name): name is string => Boolean(name)),
  );
  const connections: Record<string, AppQueueConnectionConfig> = {};

  for (const [name, connection] of Object.entries(config.connections)) {
    if (connection.driver !== 'database' || activeConnectionNames.has(name)) {
      connections[name] = connection;
    }
  }

  return connections;
}

async function createAdapterFactories(
  connections: Record<string, AppQueueConnectionConfig>,
  options: CreateQueueManagerOptions,
): Promise<Record<string, AdapterFactory>> {
  const adapters: Record<string, AdapterFactory> = {};

  for (const [name, connection] of Object.entries(connections)) {
    adapters[name] = await createAdapterFactory(connection, options);
  }

  return adapters;
}

async function createAdapterFactory(
  connection: AppQueueConnectionConfig,
  options: CreateQueueManagerOptions,
): Promise<AdapterFactory> {
  switch (connection.driver) {
    case 'sync':
      return sync();
    case 'fake':
      return fake();
    case 'redis':
      return redis({
        host: connection.host,
        port: connection.port,
        username: connection.username,
        password: connection.password,
        db: connection.db,
        keyPrefix: connection.keyPrefix,
        tls: connection.tls ? {} : undefined,
      });
    case 'database':
      return createDatabaseAdapterFactory(connection, options);
    default:
      return assertNever(connection);
  }
}

async function createDatabaseAdapterFactory(
  connection: AppQueueDatabaseConnectionConfig,
  options: CreateQueueManagerOptions,
): Promise<AdapterFactory> {
  if (!options.database) {
    throw new Error(
      'Queue database connection requires a configured DatabaseManager.',
    );
  }

  const databaseConnection = await options.database.connect(
    connection.connection,
  );
  const client = await databaseConnection.client<Knex>();

  return () =>
    new KnexAdapter({
      connection: client,
      tableName: connection.table,
      schedulesTableName: connection.schedulesTable,
      ownsConnection: false,
    });
}

function mapQueues(
  queues: Record<string, AppQueueNamedQueueConfig> | undefined,
): QueueManagerConfig['queues'] {
  if (!queues) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(queues).map(([name, queue]) => [
      name,
      {
        retry: queue.retry,
        defaultJobOptions: queue.defaultJobOptions,
        adapter: queue.connection,
      },
    ]),
  );
}

function mapWorker(
  worker: AppQueueConfig['worker'],
): QueueManagerConfig['worker'] {
  if (!worker) {
    return undefined;
  }

  const { connection, queues: _queues, ...options } = worker;

  return {
    ...options,
    adapter: connection,
  };
}

function createBoringLogger(
  logger: NocoBaseQueueLogger,
): NonNullable<QueueManagerConfig['logger']> {
  return {
    trace: (messageOrObject: string | object, message?: string) =>
      log(logger, 'trace', messageOrObject, message),
    debug: (messageOrObject: string | object, message?: string) =>
      log(logger, 'debug', messageOrObject, message),
    info: (messageOrObject: string | object, message?: string) =>
      log(logger, 'info', messageOrObject, message),
    warn: (messageOrObject: string | object, message?: string) =>
      log(logger, 'warn', messageOrObject, message),
    error: (messageOrObject: string | object, message?: string) =>
      log(logger, 'error', messageOrObject, message),
    child: (bindings: object) =>
      createBoringLogger(createChildLogger(logger, bindings)),
  };
}

function log(
  logger: NocoBaseQueueLogger,
  level: 'trace' | 'debug' | 'info' | 'warn' | 'error',
  messageOrObject: string | object,
  message?: string,
): void {
  if (typeof messageOrObject === 'string') {
    logger[level]?.({}, messageOrObject);
    return;
  }

  logger[level]?.(messageOrObject, message);
}

function createChildLogger(
  logger: NocoBaseQueueLogger,
  bindings: object,
): NocoBaseQueueLogger {
  const maybeChildLogger = logger as NocoBaseQueueLogger & {
    child?: (bindings: object) => NocoBaseQueueLogger;
  };

  return maybeChildLogger.child?.(bindings) ?? logger;
}

function assertNever(value: never): never {
  throw new Error(`Unsupported queue connection driver "${String(value)}".`);
}
