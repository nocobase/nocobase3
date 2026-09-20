import { createIORedisClient, Queue, Worker } from 'bullmq';
import { Cluster } from 'ioredis';
import { afterEach, expect, it, vi } from 'vitest';
import { createBackendRegistry } from '../../src/backends/registry.js';

afterEach(() => vi.restoreAllMocks());

it.each(['raw', 'adapter'] as const)(
  'public Queue/Worker retain a supplied %s Cluster and close only the official blocking duplicate',
  async (kind) => {
    const clients: Cluster[] = [];
    // Real Cluster options and duplicate semantics; transport never starts.
    vi.spyOn(Cluster.prototype, 'connect').mockImplementation(function (
      this: Cluster,
    ) {
      clients.push(this);
      this.status = 'ready';
      this.emit('ready');
      return Promise.resolve();
    });
    vi.spyOn(Cluster.prototype, 'info').mockResolvedValue(
      'redis_version:7.0.8\r\nmaxmemory_policy:noeviction\r\n',
    );
    vi.spyOn(Cluster.prototype, 'hmset').mockResolvedValue('OK');
    vi.spyOn(Cluster.prototype, 'disconnect').mockImplementation(function (
      this: Cluster,
    ) {
      this.status = 'end';
      this.emit('end');
    });
    const raw = new Cluster([{ host: 'cluster.example', port: 7000 }], {
      lazyConnect: true,
      redisOptions: { maxRetriesPerRequest: null, commandTimeout: 500 },
    });
    await raw.connect();
    const settings = { ...raw.options.redisOptions };
    const disconnect = vi.spyOn(raw, 'disconnect');
    const quit = vi.spyOn(raw, 'quit');
    const connection = kind === 'raw' ? raw : createIORedisClient(raw);
    const factory = createBackendRegistry().resolve('redis');
    const queue = new Queue('cluster-ownership', { connection }, factory);
    const worker = new Worker(
      'cluster-ownership',
      async () => {},
      { connection, autorun: false },
      factory,
    );
    try {
      await queue.waitUntilReady();
      await worker.waitUntilReady();
      expect(clients).toHaveLength(2);
      expect(raw.options.redisOptions).toEqual(settings);
      expect(clients[1]!.options.redisOptions).toMatchObject({
        maxRetriesPerRequest: null,
        commandTimeout: 500,
      });
    } finally {
      await worker.close(true);
      await queue.close();
    }
    expect(disconnect.mock.contexts).not.toContain(raw);
    expect(quit.mock.contexts).not.toContain(raw);
    expect(raw.status).toBe('ready');
    expect(clients[1]!.status).toBe('end');
    raw.disconnect();
  },
);
