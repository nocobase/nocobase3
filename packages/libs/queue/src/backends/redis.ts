import { createRedisBackend } from 'bullmq';
import type { BackendFactory, RedisOptions } from 'bullmq';
import { integer, keys, record } from '../config-validation.js';

/** Validates owned standalone connection settings without acquiring any sockets. */
export function resolveRedisConnection(value: unknown): RedisOptions {
  const input = record(value, 'connection');
  keys(
    input,
    [
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
  return createRedisBackend(
    name,
    {
      ...options,
      connection: {
        ...connection,
        maxRetriesPerRequest: worker ? null : 1,
        connectTimeout:
          typeof connection.connectTimeout === 'number'
            ? connection.connectTimeout
            : 10000,
        ...(worker ? {} : { commandTimeout: 10000 }),
      },
    },
    metadata,
  );
};
