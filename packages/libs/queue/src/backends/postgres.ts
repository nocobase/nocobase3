import {
  producerDeadline,
  PRODUCER_REQUEST_TIMEOUT_MS,
} from '../operation-deadline.js';
import { Socket } from 'node:net';
import { createPostgresBackend } from 'bullmq';
import type { BackendFactory, PostgresPoolConfig } from 'bullmq';
import {
  createBorrowedPostgresPool,
  isBorrowedPostgresPool,
  postgresDeadline,
} from './postgres-pool.js';
import { integer, record, validateConnection } from '../config-validation.js';

/** Validates owned PoolConfig settings without loading pg or invoking callbacks. */
export function resolvePostgresConnection(value: unknown): PostgresPoolConfig {
  validateConnection('postgres', value);
  if (isBorrowedPostgresPool(value)) return { borrowedPool: value };
  const source =
    typeof value === 'string'
      ? { connectionString: value }
      : record(value, 'connection');
  const prototype: unknown = Object.getPrototypeOf(source);
  if (prototype !== Object.prototype && prototype !== null)
    throw new TypeError(
      'Unsupported PostgreSQL connection; provide PoolConfig or a standard Pool',
    );
  const input = Object.fromEntries(Object.entries(source));
  // Revalidate the snapshot: changing getters must not bypass B6/schema checks.
  validateConnection('postgres', input);
  // B6 excludes post-connect hooks/custom clients. These additional keys belong
  // to our migration/transport owner, not to the caller's PoolConfig. Reject
  // conflicts rather than silently ignoring them in the backend spread.
  for (const key of [
    'stream',
    'migrate',
    'skipMigrations',
    'borrowedPool',
    'connect',
    '__proto__',
    'constructor',
    'prototype',
  ]) {
    if (Object.hasOwn(input, key) && input[key] !== undefined)
      throw new TypeError(`Unsupported connection field: ${key}`);
  }
  // BullMQ's open PgPoolConfig incorrectly narrows password to string. Keep
  // validated driver values in its open record, including pg password providers.
  const result: Record<string, unknown> = {
    migrate: true,
    connectionTimeoutMillis: 1000,
    statement_timeout: 10000,
  };
  for (const key of [
    'host',
    'user',
    'database',
    'connectionString',
    'schema',
    'options',
    'application_name',
    'fallback_application_name',
    'client_encoding',
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
        key === 'connectionTimeoutMillis' ? 0 : 1,
        key === 'port' ? 65535 : 2147483647,
      );
  }
  for (const [key, setting] of Object.entries(input)) {
    if (setting === undefined) continue;
    if (key === 'password') {
      if (typeof setting !== 'string' && typeof setting !== 'function')
        throw new TypeError('Invalid connection.password');
    } else if (
      [
        'keepAlive',
        'allowExitOnIdle',
        'enableChannelBinding',
        'pipeline',
        'skipVersionCheck',
      ].includes(key)
    ) {
      if (typeof setting !== 'boolean')
        throw new TypeError(`Invalid connection.${key}`);
    } else if (key === 'ssl') {
      if (typeof setting !== 'boolean') {
        const ssl = record(setting, 'connection.ssl');
        if (
          ssl.rejectUnauthorized !== undefined &&
          typeof ssl.rejectUnauthorized !== 'boolean'
        )
          throw new TypeError('Invalid connection.ssl.rejectUnauthorized');
        if (ssl.servername !== undefined && typeof ssl.servername !== 'string')
          throw new TypeError('Invalid connection.ssl.servername');
      }
    } else if (key === 'sslnegotiation') {
      if (setting !== 'postgres' && setting !== 'direct')
        throw new TypeError('Invalid connection.sslnegotiation');
    } else if (key === 'idleTimeoutMillis') {
      if (setting !== null)
        integer(setting, `connection.${key}`, 0, 2147483647);
    } else if (key === 'statement_timeout') {
      // This is a driver/session setting, not the producer request budget.
      // The owned backend still enforces that budget by retiring its sockets;
      // migration queries install their own remaining server-side deadline.
      if (setting !== false)
        integer(setting, 'connection.statement_timeout', 0, 2147483647);
    } else if (
      [
        'min',
        'query_timeout',
        'lock_timeout',
        'keepAliveInitialDelayMillis',
        'idle_in_transaction_session_timeout',
        'maxLifetimeSeconds',
      ].includes(key)
    ) {
      integer(setting, `connection.${key}`, 0, 2147483647);
    } else if (key === 'maxUses') {
      if (setting !== Infinity)
        integer(setting, 'connection.maxUses', 1, Number.MAX_SAFE_INTEGER);
    } else if (key === 'types') {
      const types = record(setting, 'connection.types');
      if (typeof types.getTypeParser !== 'function')
        throw new TypeError('Invalid connection.types.getTypeParser');
    } else if (key === 'log' || key === 'Promise') {
      if (typeof setting !== 'function')
        throw new TypeError(`Invalid connection.${key}`);
    } else if (
      typeof setting === 'symbol' ||
      typeof setting === 'bigint' ||
      (typeof setting === 'number' && !Number.isFinite(setting))
    ) {
      throw new TypeError(`Invalid connection.${key}`);
    }
    // Preserve driver-owned keys rather than a host/port whitelist. Driver
    // callbacks are not executed by side-effect-free configuration validation.
    result[key] = setting;
  }
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
      const now = performance.now();
      const end = Math.min(
        postgresDeadline.getStore() ?? Infinity,
        producerDeadline.getStore() ?? Infinity,
        now + PRODUCER_REQUEST_TIMEOUT_MS,
      );
      if (end <= now) throw new Error('PostgreSQL operation deadline exceeded');
      const deadline = setTimeout(
        () => {
          invalidated ??= new Error(
            'PostgreSQL producer deadline exceeded; connection invalidated',
          );
          void backend
            .close()
            .catch((error: unknown) => backend.emit('error', error));
        },
        Math.max(1, Math.ceil(end - now)),
      );
      try {
        const result = await postgresDeadline.run(end, operation);
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
