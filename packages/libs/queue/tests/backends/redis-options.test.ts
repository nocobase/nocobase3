import type { ConnectionOptions } from 'bullmq';
import { Redis } from 'ioredis';
import { expect, it, vi } from 'vitest';
import {
  createServiceRedisBackend,
  resolveRedisConnection,
} from '../../src/backends/redis.js';

it('copies standalone options without modifying the caller', () => {
  const input = Object.freeze({
    host: 'localhost',
    port: 6379,
    db: 0,
    username: 'user',
    password: 'secret',
    connectTimeout: 100,
  });
  expect(resolveRedisConnection(input)).toEqual(input);
  expect(resolveRedisConnection(input)).not.toBe(input);
});

it.each([
  { keyPrefix: '' },
  { keyPrefix: 'unsafe' },
  { port: 0 },
  { port: 65536 },
  { db: -1 },
  { connectTimeout: NaN },
  { password: 1 },
  { host: false },
  { family: '6' },
  { family: 5 },
  { enableOfflineQueue: 'false' },
  { skipVersionCheck: 1 },
  { retryStrategy: true },
  { maxRetriesPerRequest: -1 },
  { commandTimeout: Infinity },
  { tls: true },
  { tls: { rejectUnauthorized: 'false' } },
  { tls: { servername: 1 } },
  { scripts: { custom: { lua: 1 } } },
  { sentinels: [{ host: 'localhost', port: '26379' }] },
  { autoPipeliningIgnoredCommands: [1] },
  { monitor: true },
  { Connector: class {} },
  { constructor: {} },
  JSON.parse('{"__proto__":{"host":"wrong-target"}}'),
  { redisOptions: {} },
])(
  'rejects unsupported or invalid standalone options %j before connection',
  (options) => {
    expect(() => resolveRedisConnection(options)).toThrow();
  },
);

it.each([0, 4, 6])('accepts driver address family %s', (family) => {
  expect(resolveRedisConnection({ family })).toEqual({ family });
});

it('preserves additional structured ioredis settings without invoking callbacks', () => {
  const input = Object.freeze({
    sentinels: [{ host: 'sentinel.example', port: 26379 }],
    name: 'queue',
    sentinelTLS: { rejectUnauthorized: true },
    autoPipeliningIgnoredCommands: ['info'],
    scripts: { example: { lua: 'return 1', numberOfKeys: 0, readOnly: true } },
  } satisfies ConnectionOptions);
  expect(resolveRedisConnection(input)).toEqual(input);
});

it.each([false, true])(
  'preserves typed ordinary Redis options (flags=%s)',
  (flag) => {
    const retryStrategy = vi.fn(() => 50);
    const input = Object.freeze({
      family: 6,
      enableOfflineQueue: flag,
      skipVersionCheck: flag,
      enableReadyCheck: flag,
      noDelay: flag,
      keepAlive: 1000,
      path: '/tmp/queue-redis.sock',
      retryStrategy,
      maxRetriesPerRequest: null,
      lazyConnect: false,
      commandTimeout: 2000,
      tls: { rejectUnauthorized: true, servername: 'redis.example' },
    } satisfies ConnectionOptions);
    expect(resolveRedisConnection(input)).toEqual(input);
    expect(retryStrategy).not.toHaveBeenCalled();
  },
);

it('leaves additional driver-owned scalar keys open instead of maintaining a host/port whitelist', () => {
  expect(resolveRedisConnection({ driverSpecificFlag: true })).toEqual({
    driverSpecificFlag: true,
  });
});

it.each([false, true])(
  'passes ordinary options to the actual owned %s Redis clients without weakening role policy',
  async (worker) => {
    const clients: Redis[] = [];
    const connect = vi
      .spyOn(Redis.prototype, 'connect')
      .mockImplementation(function (this: Redis) {
        clients.push(this);
        this.status = 'ready';
        this.emit('ready');
        return Promise.resolve();
      });
    const info = vi
      .spyOn(Redis.prototype, 'info')
      .mockResolvedValue(
        'redis_version:7.0.8\r\nmaxmemory_policy:noeviction\r\n',
      );
    const disconnect = vi
      .spyOn(Redis.prototype, 'disconnect')
      .mockImplementation(function (this: Redis) {
        this.status = 'end';
        this.emit('end');
      });
    const input = Object.freeze({
      host: 'not-contacted.example',
      family: 6,
      enableOfflineQueue: false,
      skipVersionCheck: true,
      lazyConnect: false,
      maxRetriesPerRequest: 20,
      commandTimeout: 500,
      connectTimeout: 100,
    } satisfies ConnectionOptions);
    const backend = createServiceRedisBackend(
      'option-policy',
      { connection: input },
      { withBlockingConnection: worker },
    );
    backend.on('error', () => {});
    try {
      await backend.waitUntilReady();
      expect(clients).toHaveLength(worker ? 2 : 1);
      for (const client of clients) {
        expect(client.options).toMatchObject({
          host: input.host,
          family: 6,
          enableOfflineQueue: false,
          skipVersionCheck: true,
          lazyConnect: true,
          connectTimeout: 100,
          maxRetriesPerRequest: worker ? null : 1,
          commandTimeout: worker ? undefined : 10000,
        });
      }
      expect(input.maxRetriesPerRequest).toBe(20);
      expect(input.commandTimeout).toBe(500);
      expect(input.lazyConnect).toBe(false);
    } finally {
      await backend.close(true);
      connect.mockRestore();
      info.mockRestore();
      disconnect.mockRestore();
    }
  },
);

it('preserves a valid Redis URL without exposing its credentials in validation errors', () => {
  const url = 'redis://user:password@localhost:6379/2';
  expect(resolveRedisConnection({ url })).toEqual({ url });
  for (const invalid of [
    'https://user:password@localhost',
    'redis://user:password@',
    'not-a-url',
  ]) {
    expect(() => resolveRedisConnection({ url: invalid })).toThrow(
      'Invalid connection.url',
    );
    try {
      resolveRedisConnection({ url: invalid });
    } catch (error) {
      expect(String(error)).not.toContain('password');
    }
  }
});

it('rejects all invalid built-in overrides before constructing any backend', async () => {
  const { createQueueService } = await import('../../src/service.js');
  const { createInMemoryBackendFactory } =
    await import('../../src/backends/in-memory/index.js');
  const service = createQueueService({
    namespace: 'prevalidation',
    queueBackend: 'test',
    queues: {
      invalid: { queueBackend: 'redis', connection: { family: '6' } },
    },
  });
  const factory = createInMemoryBackendFactory();
  let constructed = 0;
  service.registerBackend('test', (...args) => {
    constructed++;
    return factory(...args);
  });
  service.producer('valid');
  try {
    await expect(service.setup()).rejects.toThrow('Invalid connection.family');
    expect(constructed).toBe(0);
  } finally {
    await service.shutdown();
  }
});
