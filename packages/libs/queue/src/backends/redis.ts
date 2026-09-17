import { Redis } from 'ioredis';
import { createRedisBackend } from 'bullmq';
import type { BackendFactory, RedisOptions } from 'bullmq';
import { integer, keys, record } from '../config-validation.js';

/** Validates owned standalone connection settings without acquiring any sockets. */
export function resolveRedisConnection(value: unknown): RedisOptions | Redis {
  if (value instanceof Redis) {
    if (value.options.keyPrefix)
      throw new TypeError('connection.keyPrefix is unsupported');
    return value;
  }
  const input = record(value, 'connection');
  keys(
    input,
    [
      'url',
      'host',
      'port',
      'db',
      'username',
      'password',
      'connectionName',
      'connectTimeout',
      'keyPrefix',
    ],
    'connection',
  );
  if (input.keyPrefix !== undefined)
    throw new TypeError('connection.keyPrefix is unsupported');
  const result: RedisOptions = {};
  if (input.url !== undefined) {
    if (typeof input.url !== 'string')
      throw new TypeError('Invalid connection.url');
    let parsed: URL;
    try {
      parsed = new URL(input.url);
    } catch {
      throw new TypeError('Invalid connection.url');
    }
    if (!['redis:', 'rediss:'].includes(parsed.protocol) || !parsed.hostname)
      throw new TypeError('Invalid connection.url');
    result.url = input.url;
  }
  for (const key of [
    'host',
    'username',
    'password',
    'connectionName',
  ] as const) {
    const setting = input[key];
    if (setting === undefined) continue;
    if (typeof setting !== 'string')
      throw new TypeError(`Invalid connection.${key}`);
    result[key] = setting;
  }
  for (const key of ['port', 'db', 'connectTimeout'] as const) {
    if (input[key] !== undefined)
      result[key] = integer(
        input[key],
        `connection.${key}`,
        key === 'db' ? 0 : 1,
        key === 'port' ? 65535 : 2147483647,
      );
  }
  return result;
}

/** Official backend with distinct owned producer and consumer connection policies. */
export const createServiceRedisBackend: BackendFactory = (
  name,
  options,
  metadata,
) => {
  const connection = resolveRedisConnection(options.connection);
  const worker = metadata?.withBlockingConnection === true;
  const policy = {
    maxRetriesPerRequest: worker ? null : 1,
    connectTimeout: 10000,
    commandTimeout: worker ? undefined : 10000,
  };
  const owned =
    connection instanceof Redis
      ? connection.duplicate({ ...policy, lazyConnect: true })
      : undefined;
  const backend = createRedisBackend(
    name,
    {
      ...options,
      connection: owned ?? {
        ...connection,
        ...policy,
        connectTimeout:
          !(connection instanceof Redis) &&
          typeof connection.connectTimeout === 'number'
            ? connection.connectTimeout
            : 10000,
      },
    },
    metadata,
  );
  const close = backend.close.bind(backend);
  let closing: Promise<void> | undefined;
  backend.close = (): Promise<void> =>
    (closing ??= (async (): Promise<void> => {
      // Only duplicates created here are disconnected; caller clients remain untouched.
      let ended: Promise<void> | undefined;
      if (owned && owned.status !== 'end') {
        ended = new Promise<void>((resolve) => owned.once('end', resolve));
        owned.disconnect();
      }
      try {
        await close(true);
      } finally {
        await ended;
      }
    })());
  if (!worker) {
    let invalidated: Error | undefined;
    const failure = (): Error | undefined => invalidated;
    const execute = async <T>(operation: () => Promise<T>): Promise<T> => {
      if (invalidated) throw invalidated;
      const timer = setTimeout(() => {
        invalidated ??= new Error(
          'Redis producer deadline exceeded; connection invalidated',
        );
        void backend
          .close()
          .catch((error: unknown) => backend.emit('error', error));
      }, 10000);
      try {
        const result = await operation();
        const lateFailure = failure();
        if (lateFailure) throw lateFailure;
        return result;
      } catch (error) {
        // A completed Redis error reply is not an abandoned transport operation.
        if (!failure() && error instanceof Error && error.name === 'ReplyError')
          throw error;
        invalidated ??= new Error(
          'Redis producer operation failed; connection invalidated',
          { cause: error },
        );
        try {
          await backend.close();
        } catch (cleanup) {
          throw new AggregateError(
            [invalidated, error, cleanup],
            'Redis producer operation and cleanup failed',
            { cause: cleanup },
          );
        }
        throw new AggregateError(
          [invalidated, error],
          'Redis producer operation failed',
          { cause: error },
        );
      } finally {
        clearTimeout(timer);
      }
    };
    const addJob = backend.addJob.bind(backend);
    const addJobs = backend.addJobs.bind(backend);
    backend.addJob = (...args) => execute(() => addJob(...args));
    backend.addJobs = (...args) => execute(() => addJobs(...args));
    const setQueueMeta = backend.setQueueMeta.bind(backend);
    const removeQueueMetaFields = backend.removeQueueMetaFields.bind(backend);
    const drain = backend.drain.bind(backend);
    backend.setQueueMeta = (...args) => execute(() => setQueueMeta(...args));
    backend.removeQueueMetaFields = (...args) =>
      execute(() => removeQueueMetaFields(...args));
    backend.drain = (...args) => execute(() => drain(...args));
  }
  return backend;
};
