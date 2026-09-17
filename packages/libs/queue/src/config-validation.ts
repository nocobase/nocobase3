import type { JobsOptions } from 'bullmq';
import type { RateLimitOptions } from './types.js';

export const MAX_QUEUE_TIMESTAMP: number = 2 ** 41 - 1;
export const MAX_QUEUE_COUNT: number = 2 ** 31 - 1;

export function record(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${field} must be an object`);
  }
  return value as Record<string, unknown>;
}

export function keys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  field: string,
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key))
      throw new TypeError(`Unsupported ${field} field: ${key}`);
  }
}

export function integer(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new TypeError(
      `${field} must be an integer from ${minimum} through ${maximum}`,
    );
  }
  return value;
}

export function retention(
  value: unknown,
  field: string,
): JobsOptions['removeOnComplete'] {
  if (value === undefined || typeof value === 'boolean') return value;
  if (typeof value === 'number')
    return integer(value, field, 0, MAX_QUEUE_COUNT);
  const input = record(value, field);
  keys(input, ['age', 'count', 'limit'], field);
  const age =
    input.age === undefined
      ? undefined
      : integer(
          input.age,
          `${field}.age`,
          0,
          Math.floor(Number.MAX_SAFE_INTEGER / 1000),
        );
  const count =
    input.count === undefined
      ? undefined
      : integer(input.count, `${field}.count`, 0, MAX_QUEUE_COUNT);
  const limit =
    input.limit === undefined
      ? undefined
      : integer(input.limit, `${field}.limit`, 0, MAX_QUEUE_COUNT);
  if (age !== undefined)
    return {
      age,
      ...(count === undefined ? {} : { count }),
      ...(limit === undefined ? {} : { limit }),
    };
  if (count !== undefined)
    return { count, ...(limit === undefined ? {} : { limit }) };
  // Untyped empty/limit-only objects keep everything; normalize to the typed equivalent.
  return false;
}

export function backoff(
  value: unknown,
  attempts: number,
  now: number,
): JobsOptions['backoff'] {
  if (value === undefined) return undefined;
  let delay: number;
  let type = 'fixed';
  let jitter: number | undefined;
  if (typeof value === 'number')
    delay = integer(value, 'backoff', 0, Number.MAX_SAFE_INTEGER);
  else {
    const input = record(value, 'backoff');
    keys(input, ['type', 'delay', 'jitter'], 'backoff');
    if (input.type !== 'fixed' && input.type !== 'exponential')
      throw new TypeError('Unsupported backoff.type');
    type = input.type;
    delay =
      input.delay === undefined
        ? 0
        : integer(input.delay, 'backoff.delay', 0, Number.MAX_SAFE_INTEGER);
    if (input.jitter !== undefined) {
      if (
        typeof input.jitter !== 'number' ||
        !Number.isFinite(input.jitter) ||
        input.jitter < 0 ||
        input.jitter > 1
      )
        throw new TypeError('backoff.jitter must be between 0 and 1');
      jitter = input.jitter;
    }
  }
  const exponent = Math.max(0, attempts - 2);
  if (type === 'exponential' && exponent >= 1024)
    throw new TypeError('backoff exponential overflow');
  const maximum = type === 'exponential' ? delay * 2 ** exponent : delay;
  if (!Number.isSafeInteger(maximum) || maximum > MAX_QUEUE_TIMESTAMP - now)
    throw new TypeError('backoff exceeds the precise scheduling horizon');
  return typeof value === 'number'
    ? delay
    : { type, delay, ...(jitter === undefined ? {} : { jitter }) };
}

export function rateLimit(
  value: unknown,
  now: number,
): RateLimitOptions | null | undefined {
  if (value === undefined || value === null) return value;
  const input = record(value, 'rateLimit');
  keys(input, ['max', 'duration'], 'rateLimit');
  return {
    max: integer(input.max, 'rateLimit.max', 1, MAX_QUEUE_COUNT),
    duration: integer(
      input.duration,
      'rateLimit.duration',
      1,
      Number.MAX_SAFE_INTEGER - now,
    ),
  };
}

/** Validate driver shapes without creating a connection or loading the optional pg runtime. */
export function validateConnection(backend: string, value: unknown): void {
  if (backend === 'inMemory') {
    if (value === undefined) return;
    if (Object.keys(record(value, 'connection')).length)
      throw new TypeError('inMemory connection must be empty');
    return;
  }
  if (backend !== 'redis' && backend !== 'postgres') return;
  if (backend === 'postgres' && typeof value === 'string') {
    if (!value.trim())
      throw new TypeError('postgres connection string must not be empty');
    return;
  }
  const input = record(value, 'connection');
  if (backend === 'postgres') {
    const config =
      typeof input.connect === 'function'
        ? record(input.options, 'connection.options')
        : input;
    if (config.port !== undefined)
      integer(config.port, 'connection.port', 1, 65535);
    if (config.max !== undefined)
      integer(config.max, 'connection.max', 1, MAX_QUEUE_COUNT);
    if (
      config.connectionString !== undefined &&
      typeof config.connectionString !== 'string'
    )
      throw new TypeError('Invalid connection.connectionString');
    for (const key of ['onConnect', 'verify', 'Client']) {
      if (config[key] !== undefined)
        throw new TypeError(`Unsupported connection extension: ${key}`);
    }
    if (typeof input.connect === 'function')
      integer(
        config.connectionTimeoutMillis,
        'connection.connectionTimeoutMillis',
        1,
        MAX_QUEUE_COUNT,
      );
    if (
      config.schema !== undefined &&
      (typeof config.schema !== 'string' ||
        !/^[A-Za-z_][A-Za-z0-9_$]*$/u.test(config.schema) ||
        config.schema.length > 63)
    )
      throw new TypeError('Invalid connection.schema');
    if (
      config.skipVersionCheck !== undefined &&
      typeof config.skipVersionCheck !== 'boolean'
    )
      throw new TypeError('Invalid connection.skipVersionCheck');
  }
  if (backend === 'redis') {
    const config =
      typeof input.duplicate === 'function'
        ? record(input.options ?? {}, 'connection.options')
        : input;
    const clusterConfig =
      config.redisOptions === undefined
        ? undefined
        : record(config.redisOptions, 'connection.redisOptions');
    if (config.keyPrefix || clusterConfig?.keyPrefix)
      throw new TypeError('connection.keyPrefix is unsupported');
    for (const settings of clusterConfig ? [config, clusterConfig] : [config]) {
      if (settings.port !== undefined)
        integer(settings.port, 'connection.port', 1, 65535);
      for (const flag of [
        'lazyConnect',
        'enableOfflineQueue',
        'skipVersionCheck',
      ]) {
        if (settings[flag] !== undefined && typeof settings[flag] !== 'boolean')
          throw new TypeError(`Invalid connection.${flag}`);
      }
      if (
        settings.maxRetriesPerRequest !== undefined &&
        settings.maxRetriesPerRequest !== null
      )
        integer(
          settings.maxRetriesPerRequest,
          'connection.maxRetriesPerRequest',
          0,
          MAX_QUEUE_COUNT,
        );
    }
    if (config.port !== undefined)
      integer(config.port, 'connection.port', 1, 65535);
    if (config.db !== undefined)
      integer(config.db, 'connection.db', 0, MAX_QUEUE_COUNT);
    if (config.host !== undefined && typeof config.host !== 'string')
      throw new TypeError('Invalid connection.host');
    if (config.url !== undefined && typeof config.url !== 'string')
      throw new TypeError('Invalid connection.url');
  }
}
