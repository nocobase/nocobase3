import type { AppQueueConfig } from './types.js';
import type {
  JobIdProducer,
  PublishOptions,
  QueueTimeoutOptions,
  ResolvedQueueConfiguration,
} from './types.js';
import {
  backoff,
  integer,
  keys,
  MAX_QUEUE_COUNT,
  MAX_QUEUE_TIMESTAMP,
  rateLimit,
  record,
  retention,
  validateConnection,
} from './config-validation.js';

export function createSyncQueueConfig(): AppQueueConfig {
  return {
    default: 'sync',
    connections: {
      sync: {
        driver: 'sync',
      },
    },
    worker: {
      queues: ['default'],
      concurrency: 1,
      idleDelay: '2s',
    },
    jobs: {
      locations: [],
      autoLoad: false,
      hotReload: false,
    },
  };
}

export function assertDefaultConnection(config: AppQueueConfig): void {
  if (!config.connections[config.default]) {
    throw new Error(
      `Default queue connection "${config.default}" is not configured.`,
    );
  }
}

export function withQueueJobLocations(
  config: AppQueueConfig,
  locations: readonly string[],
): AppQueueConfig {
  return {
    ...config,
    jobs: {
      ...config.jobs,
      locations: [...(config.jobs?.locations ?? []), ...locations],
    },
  };
}

const jobKeys = [
  'attempts',
  'backoff',
  'removeOnComplete',
  'removeOnFail',
  'jobIdProducer',
];
const runtimeKeys = [...jobKeys, 'concurrency', 'rateLimit'];
const defaultsKeys = [
  ...runtimeKeys,
  'namespace',
  'queueBackend',
  'connection',
];
const timerKeys = [
  'setupTimeoutMs',
  'shutdownTimeoutMs',
  'cancellationGraceMs',
];
const optionsKeys = [...defaultsKeys, ...timerKeys, 'queues'];

function merge(...layers: Record<string, unknown>[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const layer of layers) {
    for (const [key, value] of Object.entries(layer)) {
      if (value !== undefined)
        Object.defineProperty(result, key, {
          value,
          enumerable: true,
          writable: true,
          configurable: true,
        });
    }
  }
  return result;
}

function jobIdProducer(value: unknown): JobIdProducer | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'function')
    throw new TypeError('jobIdProducer must be a function');
  return (queue, channel, message) => {
    const callable = value as (
      queue: string,
      channel: string,
      message: unknown,
    ) => unknown;
    const result = callable(queue, channel, message);
    if (typeof result !== 'string')
      throw new TypeError('jobIdProducer must synchronously return a string');
    return result;
  };
}

function jobOptions(
  input: Record<string, unknown>,
  now: number,
): PublishOptions {
  const attempts = integer(
    input.attempts === undefined ? 0 : input.attempts,
    'attempts',
    0,
    MAX_QUEUE_COUNT,
  );
  const result: PublishOptions = { attempts };
  if (input.backoff !== undefined)
    result.backoff = backoff(input.backoff, attempts, now);
  if (input.removeOnComplete !== undefined)
    result.removeOnComplete = retention(
      input.removeOnComplete,
      'removeOnComplete',
    );
  if (input.removeOnFail !== undefined)
    result.removeOnFail = retention(input.removeOnFail, 'removeOnFail');
  if (input.jobIdProducer !== undefined)
    result.jobIdProducer = jobIdProducer(input.jobIdProducer);
  return result;
}

export function resolveQueueConfiguration(
  options: unknown,
  queue: string,
  manual: unknown = {},
): ResolvedQueueConfiguration {
  const global = record(options, 'options');
  keys(global, optionsKeys, 'options');
  const configured =
    global.queues === undefined ? {} : record(global.queues, 'queues');
  for (const [name, override] of Object.entries(configured))
    keys(record(override, `queues.${name}`), defaultsKeys, `queues.${name}`);
  const named = Object.hasOwn(configured, queue)
    ? record(configured[queue], `queues.${queue}`)
    : {};
  const local = record(manual, 'configure');
  keys(local, runtimeKeys, 'configure');
  resolveQueueTimeouts(global);
  const input = merge(
    { queueBackend: 'inMemory', concurrency: 1, attempts: 0 },
    global,
    named,
    local,
  );
  if (typeof input.namespace !== 'string' || !input.namespace.trim())
    throw new TypeError('namespace must be a nonempty string');
  if (typeof input.queueBackend !== 'string' || !input.queueBackend.trim())
    throw new TypeError('queueBackend must be a nonempty string');
  validateConnection(input.queueBackend, input.connection);
  const now = Date.now();
  const result: ResolvedQueueConfiguration = {
    ...jobOptions(input, now),
    namespace: input.namespace,
    queueBackend: input.queueBackend,
    concurrency: integer(input.concurrency, 'concurrency', 1, MAX_QUEUE_COUNT),
    attempts: integer(input.attempts, 'attempts', 0, MAX_QUEUE_COUNT),
  };
  if (input.connection !== undefined) result.connection = input.connection;
  if (input.rateLimit !== undefined)
    result.rateLimit = rateLimit(input.rateLimit, now);
  return result;
}

export function resolvePublishOptions(
  configuration: ResolvedQueueConfiguration,
  options: unknown = {},
  now: number = Date.now(),
): PublishOptions {
  const overrides = record(options, 'publish');
  keys(overrides, [...jobKeys, 'priority', 'delay'], 'publish');
  const input = merge({ ...configuration }, overrides);
  return {
    ...jobOptions(input, now),
    priority: integer(
      input.priority === undefined ? 0 : input.priority,
      'priority',
      0,
      2097151,
    ),
    delay: integer(
      input.delay === undefined ? 0 : input.delay,
      'delay',
      0,
      MAX_QUEUE_TIMESTAMP - now,
    ),
  };
}

export function resolveQueueTimeouts(options: unknown): QueueTimeoutOptions {
  const input = record(options, 'options');
  keys(input, optionsKeys, 'options');
  return {
    setupTimeoutMs: integer(
      input.setupTimeoutMs === undefined ? 10000 : input.setupTimeoutMs,
      'setupTimeoutMs',
      1,
      MAX_QUEUE_COUNT,
    ),
    shutdownTimeoutMs: integer(
      input.shutdownTimeoutMs === undefined ? 30000 : input.shutdownTimeoutMs,
      'shutdownTimeoutMs',
      0,
      MAX_QUEUE_COUNT,
    ),
    cancellationGraceMs: integer(
      input.cancellationGraceMs === undefined
        ? 5000
        : input.cancellationGraceMs,
      'cancellationGraceMs',
      0,
      MAX_QUEUE_COUNT,
    ),
  };
}
