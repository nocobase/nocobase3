import type { ConnectionOptions } from 'bullmq';
import { createIORedisClient, Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { afterEach, expect, it, vi } from 'vitest';
import { createInMemoryBackendFactory } from '../../src/backends/in-memory/index.js';
import { createBackendRegistry } from '../../src/backends/registry.js';
import { resolveQueueConfiguration } from '../../src/config.js';
import { createQueueService } from '../../src/service.js';

afterEach(() => vi.restoreAllMocks());

it('preserves frozen driver options by identity without invoking callbacks', () => {
  const retryStrategy = vi.fn(() => 50);
  const connection = Object.freeze({
    host: 'not-contacted.example',
    family: 6,
    maxRetriesPerRequest: null,
    commandTimeout: 500,
    retryStrategy,
    tls: Object.freeze({
      rejectUnauthorized: true,
      servername: 'redis.example',
    }),
    sentinels: [{ host: 'sentinel.example', port: 26379 }],
    name: 'queue',
    scripts: { example: { lua: 'return 1', numberOfKeys: 0, readOnly: true } },
  } satisfies ConnectionOptions);
  expect(
    resolveQueueConfiguration(
      { namespace: 'app', queueBackend: 'redis', connection },
      'email',
    ).connection,
  ).toBe(connection);
  expect(retryStrategy).not.toHaveBeenCalled();
});

it('passes opaque custom connection identity to its factory without driver inspection', async () => {
  const inspect = vi.fn(() => {
    throw new Error('Unexpected driver inspection');
  });
  const connection = Object.freeze(
    Object.defineProperty({}, 'options', { get: inspect }),
  );
  const service = createQueueService({
    namespace: 'opaque',
    queueBackend: 'custom',
    connection,
  });
  const factory = createInMemoryBackendFactory();
  const received: unknown[] = [];
  service.registerBackend('custom', (name, options, extra) => {
    received.push(options.connection);
    return factory(name, options, extra);
  });
  service.producer('email');
  try {
    await service.setup();
    expect(received).toEqual([connection]);
    expect(received[0]).toBe(connection);
    expect(inspect).not.toHaveBeenCalled();
  } finally {
    await service.shutdown();
  }
});

it('does not inspect or construct an unrequested Redis override during setup', async () => {
  const inspect = vi.fn(() => {
    throw new Error('Unexpected driver inspection');
  });
  const connection = Object.freeze(
    Object.defineProperty({}, 'duplicate', { get: inspect }),
  );
  const service = createQueueService({
    namespace: 'unused-redis',
    queues: { unused: { queueBackend: 'redis', connection } },
  });
  service.producer('memory');
  try {
    await service.setup();
    expect(inspect).not.toHaveBeenCalled();
  } finally {
    await service.shutdown();
  }
});

it('still rejects invalid business overrides before constructing any backend', async () => {
  const service = createQueueService({
    namespace: 'prevalidation',
    queueBackend: 'custom',
    queues: {
      invalid: {
        queueBackend: 'redis',
        connection: { family: 'driver-owned' },
        concurrency: 0,
      },
    },
  });
  const factory = vi.fn(createInMemoryBackendFactory());
  service.registerBackend('custom', factory);
  service.producer('valid');
  try {
    await expect(service.setup()).rejects.toThrow(/concurrency/u);
    expect(factory).not.toHaveBeenCalled();
  } finally {
    await service.shutdown();
  }
});

/** Use real driver option/duplicate handling, but never open a socket. */
function mockTransport(): Redis[] {
  const clients: Redis[] = [];
  vi.spyOn(Redis.prototype, 'connect').mockImplementation(function (
    this: Redis,
  ) {
    clients.push(this);
    this.status = 'ready';
    this.emit('ready');
    return Promise.resolve();
  });
  vi.spyOn(Redis.prototype, 'info').mockResolvedValue(
    'redis_version:7.0.8\r\nmaxmemory_policy:noeviction\r\n',
  );
  vi.spyOn(Redis.prototype, 'hmset').mockResolvedValue('OK');
  vi.spyOn(Redis.prototype, 'disconnect').mockImplementation(function (
    this: Redis,
  ) {
    this.status = 'end';
    this.emit('end');
  });
  vi.spyOn(Redis.prototype, 'quit').mockImplementation(function (this: Redis) {
    this.status = 'end';
    this.emit('end');
    return Promise.resolve('OK');
  });
  return clients;
}

it.each(['raw', 'adapter'] as const)(
  'keeps supplied %s Worker maxRetriesPerRequest:null and commandTimeout unchanged without creating a regular role copy',
  async (kind) => {
    const clients = mockTransport();
    const raw = new Redis({
      host: 'not-contacted.example',
      lazyConnect: true,
      maxRetriesPerRequest: null,
      commandTimeout: 500,
    });
    await raw.connect();
    const originalOptions = { ...raw.options };
    const disconnect = vi.spyOn(raw, 'disconnect');
    const quit = vi.spyOn(raw, 'quit');
    const factory = createBackendRegistry().resolve('redis');
    const connection = kind === 'raw' ? raw : createIORedisClient(raw);
    expect(
      resolveQueueConfiguration(
        { namespace: 'app', queueBackend: 'redis', connection },
        'email',
      ).connection,
    ).toBe(connection);
    const queue = new Queue('supplied-options', { connection }, factory);
    const worker = new Worker(
      'supplied-options',
      async () => {},
      { connection, autorun: false },
      factory,
    );
    try {
      await queue.waitUntilReady();
      await worker.waitUntilReady();
      expect(clients).toHaveLength(2);
      for (const client of clients)
        expect(client.options).toMatchObject({
          maxRetriesPerRequest: null,
          commandTimeout: 500,
        });
      expect(raw.options).toEqual(originalOptions);
    } finally {
      await worker.close(true);
      await queue.close();
    }
    expect(disconnect.mock.contexts).not.toContain(raw);
    expect(quit.mock.contexts).not.toContain(raw);
    expect(clients[1]!.status).toBe('end');
    raw.disconnect();
  },
);

it('lets the official Queue own an options-created client without service timeout rewriting', async () => {
  const clients = mockTransport();
  const connection = Object.freeze({
    host: 'not-contacted.example',
    lazyConnect: true,
    maxRetriesPerRequest: 20,
    commandTimeout: 500,
  });
  const queue = new Queue(
    'owned-options',
    { connection },
    createBackendRegistry().resolve('redis'),
  );
  try {
    await queue.waitUntilReady();
    expect(clients).toHaveLength(1);
    expect(clients[0]!.options).toMatchObject(connection);
  } finally {
    await queue.close();
  }
  expect(clients[0]!.status).toBe('end');
  expect(connection.commandTimeout).toBe(500);
  expect(connection.maxRetriesPerRequest).toBe(20);
});
