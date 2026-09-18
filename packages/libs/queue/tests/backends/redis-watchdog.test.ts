import { createIORedisClient, RedisQueueBackend } from 'bullmq';
import { Redis } from 'ioredis';
import { afterEach, expect, it, vi } from 'vitest';
import { createServiceRedisBackend } from '../../src/backends/redis.js';

function fixture(autoReady: boolean = true) {
  const clients: Redis[] = [];
  const physicalEnds = new Set<Redis>();
  const ready = (client: Redis): void => {
    client.status = 'ready';
    client.emit('ready');
  };
  const create = (): Redis => {
    const client = new Redis({ lazyConnect: true, maxRetriesPerRequest: null });
    client.status = 'ready';
    vi.spyOn(client, 'info').mockResolvedValue(
      'redis_version:7.0.8\r\nmaxmemory_policy:noeviction\r\n',
    );
    vi.spyOn(client, 'duplicate').mockImplementation(create);
    vi.spyOn(client, 'connect').mockImplementation(async () => {
      expect(physicalEnds.has(client)).toBe(true);
      physicalEnds.delete(client);
      if (autoReady) ready(client);
      else {
        client.status = 'connecting';
        await new Promise<void>((resolve, reject) => {
          const onReady = (): void => {
            client.removeListener('end', onEnd);
            resolve();
          };
          const onEnd = (): void => {
            client.removeListener('ready', onReady);
            reject(new Error('Connection ended before ready'));
          };
          client.once('ready', onReady);
          client.once('end', onEnd);
        });
      }
    });
    vi.spyOn(client, 'disconnect').mockImplementation(() => {});
    clients.push(client);
    return client;
  };
  const caller = create();
  const end = (client: Redis): void => {
    physicalEnds.add(client);
    client.status = 'end';
    client.emit('end');
  };
  return { caller, clients, end, ready };
}

afterEach(() => vi.useRealTimers());

it('resets regular and blocking reconnect handshakes only after observed end, then stops admission on close', async () => {
  vi.useFakeTimers();
  const { caller, clients, end } = fixture();
  const backend = createServiceRedisBackend(
    'watchdog',
    { connection: createIORedisClient(caller) },
    { withBlockingConnection: true },
  );
  backend.on('error', () => {});
  await backend.waitUntilReady();
  expect(clients).toHaveLength(3);
  const owned = clients.slice(1);
  try {
    for (const client of owned) client.status = 'connect';
    await vi.advanceTimersByTimeAsync(10500);
    for (const client of owned) {
      expect(client.disconnect).toHaveBeenCalledOnce();
      expect(client.connect).not.toHaveBeenCalled();
    }
    for (const client of owned) end(client);
    await vi.advanceTimersByTimeAsync(0);
    for (const client of owned) expect(client.connect).toHaveBeenCalledOnce();

    for (const client of owned) client.status = 'connect';
    await vi.advanceTimersByTimeAsync(10500);
    const closing = backend.close(true);
    for (const client of owned) end(client);
    await closing;
    await vi.advanceTimersByTimeAsync(30000);
    for (const client of owned) expect(client.connect).toHaveBeenCalledOnce();
    expect(caller.disconnect).not.toHaveBeenCalled();
    expect(caller.connect).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    for (const client of owned) end(client);
    await backend.close(true);
  }
});

it('does not cancel the driver retry timer while an ioredis client is socketless', async () => {
  vi.useFakeTimers();
  const { caller, clients, end } = fixture();
  const backend = createServiceRedisBackend(
    'retry-gap',
    { connection: createIORedisClient(caller) },
    { withBlockingConnection: true },
  );
  backend.on('error', () => {});
  await backend.waitUntilReady();
  const owned = clients.slice(1);
  try {
    for (const client of owned) client.status = 'reconnecting';
    await vi.advanceTimersByTimeAsync(10500);
    for (const client of owned)
      expect(client.disconnect).not.toHaveBeenCalled();
    for (const client of owned) client.status = 'connect';
    await vi.advanceTimersByTimeAsync(250);
    for (const client of owned)
      expect(client.disconnect).toHaveBeenCalledOnce();
  } finally {
    const closing = backend.close(true);
    for (const client of owned) end(client);
    await closing;
  }
});

it.each(['blocking-first', 'regular-first'])(
  'holds unsent Worker commands through physical end and readiness (%s)',
  async (order) => {
    vi.useFakeTimers();
    const { caller, clients, end, ready } = fixture(false);
    const backend = createServiceRedisBackend(
      'admission',
      { connection: createIORedisClient(caller) },
      { withBlockingConnection: true },
    );
    backend.on('error', () => {});
    expect(backend).toBeInstanceOf(RedisQueueBackend);
    const client = await (backend as RedisQueueBackend).client;
    await backend.waitUntilReady();
    const regular = clients[1]!;
    const blocking = clients[2]!;
    const dispatched: string[] = [];
    // Model the offline command queue being rejected at the retiring end.
    const dispatch = vi.fn(() => {
      dispatched.push(regular.status);
      return regular.status === 'ready'
        ? Promise.resolve('fetched')
        : new Promise((_resolve, reject) =>
            regular.once('end', () =>
              reject(new Error('Connection is closed.')),
            ),
          );
    });
    createIORedisClient(regular).runCommand = dispatch;
    let fetch: Promise<unknown> | undefined;
    try {
      regular.status = blocking.status = 'connect';
      await vi.advanceTimersByTimeAsync(10500);
      const first = order === 'blocking-first' ? blocking : regular;
      const second = order === 'blocking-first' ? regular : blocking;
      end(first);
      await vi.advanceTimersByTimeAsync(0);
      fetch = client.runCommand('fetch', []);
      void fetch.catch(() => {});
      await vi.advanceTimersByTimeAsync(0);
      expect(dispatch).not.toHaveBeenCalled();
      end(second);
      await vi.advanceTimersByTimeAsync(0);
      expect(dispatch).not.toHaveBeenCalled();
      // Blocking recovery alone must not release the regular admission gate.
      ready(blocking);
      await vi.advanceTimersByTimeAsync(0);
      expect(dispatch).not.toHaveBeenCalled();
      ready(regular);
      await expect(fetch).resolves.toBe('fetched');
      expect(dispatched).toEqual(['ready']);
    } finally {
      const closing = backend.close(true);
      end(regular);
      end(blocking);
      await closing;
      await fetch?.catch(() => {});
      expect(caller.disconnect).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    }
  },
);

it.each(['ending', 'connecting'])(
  'settles admission waiters on shutdown during %s without resurrection',
  async (phase) => {
    vi.useFakeTimers();
    const { caller, clients, end } = fixture(false);
    const backend = createServiceRedisBackend(
      'admission-close',
      { connection: createIORedisClient(caller) },
      { withBlockingConnection: true },
    );
    backend.on('error', () => {});
    const client = await (backend as RedisQueueBackend).client;
    await backend.waitUntilReady();
    const owned = clients.slice(1);
    const regular = owned[0]!;
    const dispatch = vi.fn().mockResolvedValue('unexpected');
    createIORedisClient(regular).runCommand = dispatch;
    try {
      for (const item of owned) item.status = 'connect';
      await vi.advanceTimersByTimeAsync(10500);
      if (phase === 'connecting') {
        for (const item of owned) end(item);
        await vi.advanceTimersByTimeAsync(0);
      }
      const fetch = client.runCommand('fetch', []);
      const result = Promise.allSettled([fetch]);
      await vi.advanceTimersByTimeAsync(0);
      expect(dispatch).not.toHaveBeenCalled();
      const closing = backend.close(true);
      // Admission must settle even while physical shutdown is still pending.
      await expect(result).resolves.toMatchObject([
        {
          status: 'rejected',
          reason: { message: 'Redis resource owner is closing' },
        },
      ]);
      for (const item of owned) end(item);
      await closing;
      await vi.advanceTimersByTimeAsync(30000);
      for (const item of owned)
        expect(item.connect).toHaveBeenCalledTimes(
          phase === 'connecting' ? 1 : 0,
        );
      expect(dispatch).not.toHaveBeenCalled();
      await expect(client.runCommand('late', [])).rejects.toThrow('closing');
    } finally {
      const closing = backend.close(true);
      for (const item of owned) end(item);
      await closing;
      expect(vi.getTimerCount()).toBe(0);
    }
  },
);
