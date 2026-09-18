import {
  producerDeadline,
  PRODUCER_REQUEST_TIMEOUT_MS,
} from '../operation-deadline.js';
import { Redis, Cluster } from 'ioredis';
import {
  createRedisBackend,
  createIORedisClient,
  createNodeRedisClient,
  isIRedisClient,
} from 'bullmq';
import type { BackendFactory, IRedisClient, RedisOptions } from 'bullmq';
import { integer, record } from '../config-validation.js';

/** Raw node-redis capabilities used only to duplicate the caller's client. */
export interface NativeRedisClient {
  readonly isOpen: boolean;
  readonly isReady: boolean;
  readonly options?: object;
  sendCommand: (...args: never[]) => unknown;
  duplicate: (options?: object) => unknown;
  connect: () => Promise<unknown>;
  on: (...args: never[]) => unknown;
}

function isNativeRedisClient(value: unknown): value is NativeRedisClient {
  return (
    typeof value === 'object' &&
    value !== null &&
    'sendCommand' in value &&
    typeof value.sendCommand === 'function' &&
    'duplicate' in value &&
    typeof value.duplicate === 'function' &&
    'connect' in value &&
    typeof value.connect === 'function' &&
    'on' in value &&
    typeof value.on === 'function' &&
    'isOpen' in value &&
    typeof value.isOpen === 'boolean' &&
    'isReady' in value &&
    typeof value.isReady === 'boolean'
  );
}

function duplicateNative(client: NativeRedisClient): IRedisClient {
  const duplicate = client.duplicate();
  if (duplicate === client || !isNativeRedisClient(duplicate))
    throw new TypeError('Redis duplicate must be a distinct native client');
  return createNodeRedisClient(duplicate);
}

/** Validates connection settings without adapting, duplicating, or opening clients. */
export function resolveRedisConnection(
  value: unknown,
): RedisOptions | Redis | Cluster | IRedisClient | NativeRedisClient {
  if (isIRedisClient(value)) {
    const nested: unknown = value.options.redisOptions;
    if (
      value.options.keyPrefix ||
      (value.isCluster &&
        typeof nested === 'object' &&
        nested !== null &&
        'keyPrefix' in nested &&
        nested.keyPrefix)
    )
      throw new TypeError('connection.keyPrefix is unsupported');
    return value;
  }
  if (isNativeRedisClient(value)) return value;
  if (value instanceof Cluster) {
    if (value.options.redisOptions?.keyPrefix)
      throw new TypeError('connection.keyPrefix is unsupported');
    return value;
  }
  if (value instanceof Redis) {
    if (value.options.keyPrefix)
      throw new TypeError('connection.keyPrefix is unsupported');
    return value;
  }
  const source = record(value, 'connection');
  const prototype: unknown = Object.getPrototypeOf(source);
  if (prototype !== Object.prototype && prototype !== null)
    throw new TypeError(
      'Unsupported Redis client; provide connection options or a supported client',
    );
  // Snapshot getters once so the driver receives exactly the values validated.
  const input = Object.fromEntries(Object.entries(source));
  // These are not standalone connection settings: accepting them would lose a
  // client/Cluster target or replace the owned transport implementation.
  for (const key of [
    'redisOptions',
    'Connector',
    'connect',
    'duplicate',
    'isCluster',
    '__proto__',
    'constructor',
    'prototype',
  ]) {
    if (Object.hasOwn(input, key) && input[key] !== undefined)
      throw new TypeError(`Unsupported connection field: ${key}`);
  }
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
  for (const [key, setting] of Object.entries(input)) {
    if (setting === undefined || Object.hasOwn(result, key)) continue;
    if (key === 'family') {
      if (setting !== 0 && setting !== 4 && setting !== 6)
        throw new TypeError('Invalid connection.family');
    } else if (
      [
        'enableOfflineQueue',
        'skipVersionCheck',
        'lazyConnect',
        'enableReadyCheck',
        'noDelay',
        'disableClientInfo',
        'autoResubscribe',
        'autoResendUnfulfilledCommands',
        'readOnly',
        'stringNumbers',
        'enableAutoPipelining',
        'offlineQueue',
        'commandQueue',
        'enableTLSForSentinelMode',
        'updateSentinels',
        'failoverDetector',
      ].includes(key)
    ) {
      if (typeof setting !== 'boolean')
        throw new TypeError(`Invalid connection.${key}`);
    } else if (
      [
        'path',
        'clientInfoTag',
        'name',
        'sentinelUsername',
        'sentinelPassword',
        'role',
      ].includes(key)
    ) {
      if (typeof setting !== 'string')
        throw new TypeError(`Invalid connection.${key}`);
    } else if (
      [
        'keepAlive',
        'commandTimeout',
        'socketTimeout',
        'blockingTimeoutGrace',
        'maxLoadingRetryTime',
        'sentinelMaxConnections',
        'sentinelCommandTimeout',
        'disconnectTimeout',
      ].includes(key)
    ) {
      integer(setting, `connection.${key}`, 0, 2147483647);
    } else if (key === 'blockingTimeout') {
      integer(setting, `connection.${key}`, -2147483648, 2147483647);
    } else if (key === 'maxRetriesPerRequest') {
      if (setting !== null)
        integer(setting, `connection.${key}`, 0, 2147483647);
    } else if (
      [
        'retryStrategy',
        'reconnectOnError',
        'sentinelRetryStrategy',
        'sentinelReconnectStrategy',
      ].includes(key)
    ) {
      if (setting !== null && typeof setting !== 'function')
        throw new TypeError(`Invalid connection.${key}`);
    } else if (key === 'tls' || key === 'sentinelTLS') {
      const tls = record(setting, `connection.${key}`);
      if (
        tls.rejectUnauthorized !== undefined &&
        typeof tls.rejectUnauthorized !== 'boolean'
      )
        throw new TypeError(`Invalid connection.${key}.rejectUnauthorized`);
      if (tls.servername !== undefined && typeof tls.servername !== 'string')
        throw new TypeError(`Invalid connection.${key}.servername`);
    } else if (key === 'scripts') {
      const scripts = record(setting, 'connection.scripts');
      for (const script of Object.values(scripts)) {
        const definition = record(script, 'connection.scripts[]');
        if (typeof definition.lua !== 'string')
          throw new TypeError('Invalid connection.scripts[].lua');
        if (definition.numberOfKeys !== undefined)
          integer(
            definition.numberOfKeys,
            'connection.scripts[].numberOfKeys',
            0,
            2147483647,
          );
        if (
          definition.readOnly !== undefined &&
          typeof definition.readOnly !== 'boolean'
        )
          throw new TypeError('Invalid connection.scripts[].readOnly');
      }
    } else if (key === 'sentinels') {
      if (!Array.isArray(setting))
        throw new TypeError('Invalid connection.sentinels');
      for (const sentinel of setting) {
        const address = record(sentinel, 'connection.sentinels[]');
        if (address.host !== undefined && typeof address.host !== 'string')
          throw new TypeError('Invalid connection.sentinels[].host');
        if (address.port !== undefined)
          integer(address.port, 'connection.sentinels[].port', 1, 65535);
      }
    } else if (key === 'autoPipeliningIgnoredCommands') {
      if (
        !Array.isArray(setting) ||
        setting.some((item: unknown) => typeof item !== 'string')
      )
        throw new TypeError(`Invalid connection.${key}`);
    } else if (key === 'monitor' && setting !== false) {
      throw new TypeError(
        'connection.monitor is incompatible with queue commands',
      );
    } else if (
      typeof setting === 'symbol' ||
      typeof setting === 'bigint' ||
      (typeof setting === 'number' && !Number.isFinite(setting))
    ) {
      throw new TypeError(`Invalid connection.${key}`);
    }
    // Driver-owned extension keys stay open. Known fields are checked above;
    // driver-specific nested structures and callback results remain driver-owned.
    result[key] = setting;
  }
  return result;
}

// Lifecycle and event methods must remain synchronous. Only transport commands
// wait for a retiring generation; transaction builders are gated at exec instead.
const redisCommands: ReadonlySet<PropertyKey> = new Set<keyof IRedisClient>([
  'runCommand',
  'hgetall',
  'hget',
  'hmget',
  'hset',
  'hdel',
  'hexists',
  'get',
  'set',
  'del',
  'zrange',
  'zrevrange',
  'zcard',
  'zscore',
  'lrange',
  'llen',
  'ltrim',
  'lpos',
  'smembers',
  'xadd',
  'xread',
  'xtrim',
  'bzpopmin',
  'info',
  'clientSetName',
  'clientList',
  'scan',
]);

/** Owns every public duplicate, including the official backend's blocking client. */
class RedisClientOwner {
  private readonly clients = new Set<IRedisClient>();
  private readonly stalled = new Map<IRedisClient, number>();
  private readonly resets = new Map<IRedisClient, Promise<void>>();
  private readonly endings = new Map<IRedisClient, Promise<void>>();
  private readonly ended = new Set<IRedisClient>();
  private readonly connecting = new Set<Promise<void>>();
  private readonly stopRecovery = new AbortController();
  private readonly timer: ReturnType<typeof setInterval> | undefined;
  private stopping = false;

  constructor(worker: boolean) {
    if (worker) {
      this.timer = setInterval(() => this.check(), 250);
      this.timer.unref();
    }
  }

  track(client: IRedisClient): IRedisClient {
    if (this.stopping) {
      client.disconnect();
      throw new Error('Redis resource owner is closing');
    }
    this.clients.add(client);
    // Keep client errors observed while disconnect settles after backend listeners leave.
    client.on('error', this.observeError);
    client.on('end', () => this.ended.add(client));
    return new Proxy(client, {
      get: (target, key) => {
        // A Cluster's later node drain can overwrite end with close. Preserve the
        // observed terminal generation until an explicit connect admits a new one.
        if (key === 'status' && this.ended.has(target)) return 'end';
        if (key === 'duplicate')
          return (...args: unknown[]): IRedisClient => {
            if (this.stopping)
              throw new Error('Redis resource owner is closing');
            const duplicate = target.duplicate(...args);
            if (duplicate === target)
              throw new TypeError(
                'Redis duplicate must be a distinct owned client',
              );
            return this.track(duplicate);
          };
        if (key === 'disconnect')
          return (reconnect: boolean = false): void => {
            if (reconnect && !this.stopping) target.disconnect(true);
            else void this.end(target).catch(this.observeError);
          };
        if (key === 'connect')
          return (): Promise<void> => {
            if (this.stopping)
              return Promise.reject(
                new Error('Redis resource owner is closing'),
              );
            const resetting = this.resets.get(target);
            return resetting
              ? resetting.then(() => this.connect(target))
              : this.connect(target);
          };
        if (key === 'multi' || key === 'pipeline')
          return (): ReturnType<IRedisClient['multi']> => {
            const transaction = target[key]();
            const proxy = new Proxy(transaction, {
              get: (batch, method) => {
                const value: unknown = Reflect.get(batch, method, batch);
                if (method === 'exec')
                  return () => this.command(target, () => batch.exec());
                return typeof value === 'function'
                  ? (...args: unknown[]): unknown => {
                      const result: unknown = Reflect.apply(value, batch, args);
                      return result === batch ? proxy : result;
                    }
                  : value;
              },
            });
            return proxy;
          };
        const value: unknown = Reflect.get(target, key, target);
        if (redisCommands.has(key) && typeof value === 'function')
          return (...args: unknown[]): Promise<unknown> =>
            this.command(target, (): unknown =>
              Reflect.apply(value, target, args),
            );
        return typeof value === 'function'
          ? (...args: unknown[]): unknown => Reflect.apply(value, target, args)
          : value;
      },
    });
  }

  private readonly observeError = (): void => {};

  private async command<T>(
    client: IRedisClient,
    dispatch: () => T,
  ): Promise<T> {
    // Recheck after awaiting: another retirement may have started in between.
    while (this.resets.has(client)) await this.resets.get(client);
    if (this.stopping) throw new Error('Redis resource owner is closing');
    return dispatch();
  }

  private untilStopped(operation: Promise<void>): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const stop = (): void => {
        this.stopRecovery.signal.removeEventListener('abort', stop);
        reject(new Error('Redis resource owner is closing'));
      };
      this.stopRecovery.signal.addEventListener('abort', stop, { once: true });
      void operation.then(
        () => {
          this.stopRecovery.signal.removeEventListener('abort', stop);
          resolve();
        },
        (error: unknown) => {
          this.stopRecovery.signal.removeEventListener('abort', stop);
          reject(
            error instanceof Error
              ? error
              : new Error('Redis recovery failed', { cause: error }),
          );
        },
      );
      if (this.stopping) stop();
    });
  }

  private recover(client: IRedisClient): Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
      const cleanup = (): void => {
        clearTimeout(timer);
        client.removeListener('ready', ready);
        this.stopRecovery.signal.removeEventListener('abort', stopped);
      };
      const ready = (): void => {
        cleanup();
        resolve(true);
      };
      const stopped = (): void => {
        cleanup();
        reject(new Error('Redis resource owner is closing'));
      };
      // Recovery itself can lose handshake bytes. Keep admission closed across
      // further generations instead of pinning a dead readiness promise forever.
      const timer = setTimeout(() => {
        cleanup();
        resolve(false);
      }, 10000);
      timer.unref();
      client.once('ready', ready);
      this.stopRecovery.signal.addEventListener('abort', stopped, {
        once: true,
      });
      if (this.stopping) {
        stopped();
        return;
      }
      try {
        // node-redis's adapter resets its terminal status only here. The
        // retiring generation has physically ended before recovery is admitted.
        client.disconnect(true);
        void this.connect(client).then(() => {
          if (client.status === 'ready') ready();
        }, this.observeError);
      } catch {
        // Retry at the watchdog cadence, without admitting unsent commands.
      }
    });
  }

  private async connect(client: IRedisClient): Promise<void> {
    // Upstream blocking reconnects also pass here. Do not open a new generation
    // while nodes from its interrupted predecessor still have live sockets.
    await this.endings.get(client);
    if (this.stopping) throw new Error('Redis resource owner is closing');
    this.endings.delete(client);
    this.ended.delete(client);
    // Native adapters can reconnect synchronously from disconnect(true).
    if (client.status === 'ready') return;
    const operation = client.connect();
    this.connecting.add(operation);
    void operation.then(
      () => this.connecting.delete(operation),
      () => this.connecting.delete(operation),
    );
    return operation;
  }

  private end(client: IRedisClient): Promise<void> {
    const pending = this.endings.get(client);
    if (pending) return pending;
    // Cluster's status can precede node socket endings. Capture nodes before disconnect.
    const nodes = client.isCluster ? (client.nodes?.() ?? []) : [];
    const ends = [...nodes, client].map((item) =>
      item.status === 'end' ||
      (item === client && this.ended.has(client)) ||
      (item instanceof Redis && item.status === 'reconnecting')
        ? // ioredis enters reconnecting only after its socket close event. The
          // disconnect below cancels the retry timer; no new end event is emitted.
          Promise.resolve()
        : new Promise<void>((resolve) => item.once('end', resolve)),
    );
    const ending = Promise.all(ends).then(() => {});
    this.endings.set(client, ending);
    client.disconnect();
    return ending;
  }

  private check(): void {
    if (this.stopping) return;
    for (const client of this.clients) {
      if (client.status === 'ready' || client.status === 'wait') {
        this.stalled.delete(client);
        continue;
      }
      const since = this.stalled.get(client) ?? performance.now();
      this.stalled.set(client, since);
      // ioredis has no socket in this phase. disconnect() would cancel its retry
      // timer without ever emitting end; let it reach the handshake first.
      if (
        client.status === 'reconnecting' ||
        performance.now() - since < 10000 ||
        this.resets.has(client)
      )
        continue;
      // Install every admission barrier before ending either transport. A
      // blocking end (including upstream's watchdog) can release a regular
      // fetch while its old socket is still closing. Never enqueue that fetch
      // until the old end AND the new ready have both been observed.
      const reset = this.untilStopped(
        Promise.resolve().then(async () => {
          if (this.stopping) return;
          do {
            // A socketless ioredis retry has no end event; end() cancels its
            // timer safely before recovery starts a new generation.
            await this.end(client);
            this.endings.delete(client);
            this.stalled.delete(client);
            if (this.stopping || (await this.recover(client))) return;
          } while (!this.stopping);
        }),
      ).finally(() => {
        this.resets.delete(client);
      });
      this.resets.set(client, reset);
      void reset.catch(this.observeError);
    }
  }

  async close(): Promise<void> {
    this.stopping = true;
    this.stopRecovery.abort();
    clearInterval(this.timer);
    await Promise.all([...this.clients].map((client) => this.end(client)));
    await Promise.allSettled(this.resets.values());
    await Promise.allSettled(this.connecting);
    // An official node-redis adapter emits end synchronously from destroy(),
    // before the socket's final error/close callbacks. Retain the inert owned
    // listener so a late transport error cannot become an unhandled exception.
    this.clients.clear();
    this.stalled.clear();
    this.endings.clear();
    this.ended.clear();
  }
}

/** Official backend with distinct owned producer and consumer connection policies. */
export const createServiceRedisBackend: BackendFactory = (
  name,
  options,
  metadata,
) => {
  const connection = resolveRedisConnection(options.connection);
  const worker = metadata?.withBlockingConnection === true;
  // Deliberate role overrides, never modifications of the caller's options:
  // producers have bounded command retries; blocking workers must not inherit
  // producer command deadlines. The owner starts all clients lazily.
  const policy = {
    maxRetriesPerRequest: worker ? null : 1,
    connectTimeout: 10000,
    commandTimeout: worker ? undefined : 10000,
  };
  const connectTimeout =
    'connectTimeout' in connection &&
    typeof connection.connectTimeout === 'number'
      ? connection.connectTimeout
      : 10000;
  const owned = isIRedisClient(connection)
    ? connection.duplicate({ ...policy, lazyConnect: true })
    : isNativeRedisClient(connection)
      ? // Adapting the caller directly auto-connects it in BullMQ 6.3.6.
        duplicateNative(connection)
      : connection instanceof Redis
        ? createIORedisClient(
            connection.duplicate({ ...policy, lazyConnect: true }),
          )
        : connection instanceof Cluster
          ? createIORedisClient(
              connection.duplicate(undefined, {
                lazyConnect: true,
                redisOptions: { ...connection.options.redisOptions, ...policy },
              }),
            )
          : createIORedisClient(
              connection.url
                ? new Redis(connection.url, {
                    ...connection,
                    ...policy,
                    connectTimeout,
                    lazyConnect: true,
                  })
                : new Redis({
                    ...connection,
                    ...policy,
                    connectTimeout,
                    lazyConnect: true,
                  }),
            );
  if (owned === connection)
    throw new TypeError('Redis duplicate must be a distinct owned client');
  const resources = new RedisClientOwner(worker);
  const backend = createRedisBackend(
    name,
    { ...options, connection: resources.track(owned) },
    metadata,
  );
  const close = backend.close.bind(backend);
  let closing: Promise<void> | undefined;
  backend.close = (): Promise<void> =>
    (closing ??= (async (): Promise<void> => {
      // Stop reconnect admission before upstream close can yield or force status=end.
      const ended = resources.close();
      const results = await Promise.allSettled([close(true), ended]);
      const errors = results.flatMap((result) =>
        result.status === 'rejected' ? [result.reason as unknown] : [],
      );
      if (errors.length)
        throw new AggregateError(errors, 'Redis resource cleanup failed');
    })());
  if (!worker) {
    let invalidated: Error | undefined;
    const failure = (): Error | undefined =>
      invalidated ??
      (closing ? new Error('Redis producer connection closed') : undefined);
    const execute = async <T>(operation: () => Promise<T>): Promise<T> => {
      const unavailable = failure();
      if (unavailable) throw unavailable;
      const remaining = Math.min(
        PRODUCER_REQUEST_TIMEOUT_MS,
        (producerDeadline.getStore() ?? Infinity) - performance.now(),
      );
      if (remaining <= 0)
        throw new Error('Redis producer deadline exceeded before dispatch');
      const timer = setTimeout(() => {
        invalidated ??= new Error(
          'Redis producer deadline exceeded; connection invalidated',
        );
        void backend
          .close()
          .catch((error: unknown) => backend.emit('error', error));
      }, remaining);
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
    backend.addJob = (...args) =>
      execute(async () => {
        const id = await addJob(...args);
        if (typeof id !== 'string')
          throw new Error('Redis backend returned an invalid job ID');
        return id;
      });
    backend.addJobs = (...args) =>
      execute(async () => {
        const ids = await addJobs(...args);
        if (
          !Array.isArray(ids) ||
          ids.length !== args[0].length ||
          ids.some((id) => typeof id !== 'string')
        )
          throw new Error('Redis backend returned invalid job IDs');
        return ids;
      });
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
