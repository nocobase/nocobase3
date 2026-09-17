import { Socket } from 'node:net';
import { createPostgresBackend } from 'bullmq';
import type { BackendFactory, PostgresPoolConfig } from 'bullmq';
import {
  createBorrowedPostgresPool,
  isBorrowedPostgresPool,
  postgresDeadline,
} from './postgres-pool.js';
import {
  integer,
  keys,
  record,
  validateConnection,
} from '../config-validation.js';

/** Resolves the owned PoolConfig subset without loading the optional pg driver. */
export function resolvePostgresConnection(value: unknown): PostgresPoolConfig {
  validateConnection('postgres', value);
  if (isBorrowedPostgresPool(value)) return { borrowedPool: value };
  const input =
    typeof value === 'string'
      ? { connectionString: value }
      : record(value, 'connection');
  keys(
    input,
    [
      'host',
      'port',
      'user',
      'password',
      'database',
      'connectionString',
      'schema',
      'max',
      'connectionTimeoutMillis',
      'skipVersionCheck',
    ],
    'connection',
  );
  const result: PostgresPoolConfig = {
    migrate: true,
    connectionTimeoutMillis: 1000,
    statement_timeout: 10000,
  };
  for (const key of [
    'host',
    'user',
    'password',
    'database',
    'connectionString',
    'schema',
  ] as const) {
    const setting = input[key];
    if (setting === undefined) continue;
    if (typeof setting !== 'string')
      throw new TypeError(`Invalid connection.${key}`);
    result[key] = setting;
  }
  for (const key of ['port', 'max', 'connectionTimeoutMillis'] as const) {
    if (input[key] !== undefined)
      result[key] = integer(
        input[key],
        `connection.${key}`,
        1,
        key === 'port' ? 65535 : 2147483647,
      );
  }
  if (typeof input.skipVersionCheck === 'boolean')
    result.skipVersionCheck = input.skipVersionCheck;
  return result;
}

/** Owns only transports supplied through pg's public stream factory. */
export const createServicePostgresBackend: BackendFactory = (
  name,
  options,
  metadata,
) => {
  const sockets = new Set<Socket>();
  let closed = false;
  const connection = record(options.connection, 'connection');
  const borrowed = isBorrowedPostgresPool(connection.borrowedPool)
    ? createBorrowedPostgresPool(connection.borrowedPool)
    : undefined;
  const backend = createPostgresBackend(
    name,
    {
      ...options,
      connection: borrowed?.pool ?? {
        ...connection,
        stream: (): Socket => {
          if (closed) throw new Error('PostgreSQL backend is closed');
          const socket = new Socket();
          sockets.add(socket);
          socket.once('close', () => sockets.delete(socket));
          return socket;
        },
      },
    },
    metadata,
  );
  const close = backend.close.bind(backend);
  let closing: Promise<void> | undefined;
  backend.close = (): Promise<void> =>
    (closing ??= (async (): Promise<void> => {
      closed = true;
      const endings = [...sockets].map(
        (socket) =>
          new Promise<void>((resolve) => {
            socket.once('close', resolve);
          }),
      );
      const force = setTimeout(() => {
        for (const socket of sockets) socket.destroy();
      }, 1000);
      try {
        await Promise.all([close(), borrowed?.close(), ...endings]);
      } finally {
        clearTimeout(force);
      }
    })());
  if (!metadata?.withBlockingConnection) {
    let invalidated: Error | undefined;
    const getFailure = (): Error | undefined => invalidated;
    const execute = async <T>(operation: () => Promise<T>): Promise<T> => {
      if (invalidated) throw invalidated;
      const deadline = setTimeout(() => {
        invalidated ??= new Error(
          'PostgreSQL producer deadline exceeded; connection invalidated',
        );
        void backend
          .close()
          .catch((error: unknown) => backend.emit('error', error));
      }, 10000);
      try {
        const result = await postgresDeadline.run(
          performance.now() + 10000,
          operation,
        );
        const failure = getFailure();
        if (failure) throw failure;
        return result;
      } catch (error) {
        const code: unknown =
          error instanceof Error && 'code' in error ? error.code : undefined;
        if (
          !getFailure() &&
          typeof code === 'string' &&
          /^[0-9A-Z]{5}$/u.test(code) &&
          !code.startsWith('08')
        )
          throw error;
        invalidated ??= new Error(
          'PostgreSQL producer operation failed; connection invalidated',
          { cause: error },
        );
        try {
          await backend.close();
        } catch (cleanup) {
          throw new AggregateError(
            [invalidated, error, cleanup],
            'PostgreSQL producer operation and cleanup failed',
            { cause: cleanup },
          );
        }
        throw new AggregateError(
          [invalidated, error],
          'PostgreSQL producer operation failed',
          { cause: error },
        );
      } finally {
        clearTimeout(deadline);
      }
    };
    const addJob = backend.addJob.bind(backend);
    const addJobs = backend.addJobs.bind(backend);
    const setQueueMeta = backend.setQueueMeta.bind(backend);
    const removeQueueMetaFields = backend.removeQueueMetaFields.bind(backend);
    const drain = backend.drain.bind(backend);
    backend.addJob = (...args) => execute(() => addJob(...args));
    backend.addJobs = (...args) => execute(() => addJobs(...args));
    backend.setQueueMeta = (...args) => execute(() => setQueueMeta(...args));
    backend.removeQueueMetaFields = (...args) =>
      execute(() => removeQueueMetaFields(...args));
    backend.drain = (...args) => execute(() => drain(...args));
  }
  return backend;
};
