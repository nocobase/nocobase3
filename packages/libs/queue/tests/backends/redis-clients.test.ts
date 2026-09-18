import { EventEmitter } from 'node:events';
import { createIORedisClient, createNodeRedisClient, Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { afterEach, expect, it, vi } from 'vitest';
import {
  createServiceRedisBackend,
  resolveRedisConnection,
} from '../../src/backends/redis.js';

/** No network implementation of the native client capability boundary. */
class NativeClient extends EventEmitter {
  isOpen = true;
  isReady = true;
  readonly options = Object.freeze({ url: 'redis://target.example:6399/4' });
  connect = vi.fn(async () => {
    this.isOpen = true;
    this.isReady = true;
    this.emit('ready');
  });
  destroy = vi.fn(() => {
    this.isOpen = false;
    this.isReady = false;
    this.emit('end');
  });
  quit = vi.fn(async () => 'OK');
  sendCommand = vi.fn(async () => 'OK');
  evalSha = vi.fn(async (): Promise<string | null> => 'job-id');
  hSet = vi.fn(async () => 1);
  multi(): { evalSha: () => void; exec: () => Promise<string[]> } {
    let count = 0;
    return {
      evalSha: () => {
        count++;
      },
      exec: async () =>
        Array.from({ length: count }, (_, index) => `bulk-${index}`),
    };
  }
  scriptLoad = vi.fn(async () => 'sha');
  clientSetName = vi.fn(async () => 'OK');
  info = vi.fn(
    async () => 'redis_version:7.0.8\r\nmaxmemory_policy:noeviction\r\n',
  );
  duplicates: NativeClient[] = [];
  duplicate = vi.fn(() => {
    const duplicate = new NativeClient();
    this.duplicates.push(duplicate);
    return duplicate;
  });
}

afterEach(() => vi.useRealTimers());

it('preserves a non-enumerable native client without connecting, duplicating, or installing listeners during validation', () => {
  const raw = new NativeClient();
  for (const key of Object.keys(raw))
    Object.defineProperty(raw, key, { enumerable: false });
  expect(resolveRedisConnection(raw)).toBe(raw);
  expect(raw.connect).not.toHaveBeenCalled();
  expect(raw.duplicate).not.toHaveBeenCalled();
  expect(raw.eventNames()).toEqual([]);
});

it('rejects an unrecognized empty client instance instead of falling back to localhost', () => {
  class UnrecognizedClient {}
  expect(() => resolveRedisConnection(new UnrecognizedClient())).toThrow(
    'Unsupported Redis client',
  );
});

it('accepts official IRedisClient without mutating or duplicating it during validation', () => {
  const raw = new NativeClient();
  const adapter = createNodeRedisClient(raw);
  const listeners = raw.eventNames().map((event) => raw.listenerCount(event));
  expect(resolveRedisConnection(adapter)).toBe(adapter);
  expect(raw.connect).not.toHaveBeenCalled();
  expect(raw.duplicate).not.toHaveBeenCalled();
  expect(raw.eventNames().map((event) => raw.listenerCount(event))).toEqual(
    listeners,
  );
});

it.each(['raw', 'adapter'] as const)(
  'owns only role and blocking duplicates for %s node-redis',
  async (kind) => {
    const raw = new NativeClient();
    const connection = kind === 'raw' ? raw : createNodeRedisClient(raw);
    const backend = createServiceRedisBackend(
      'owned',
      { connection },
      { withBlockingConnection: true },
    );
    backend.on('error', () => {});
    try {
      await backend.waitUntilReady();
      expect(raw.duplicates).toHaveLength(1);
      const owned = raw.duplicates[0]!;
      expect(owned.options.url).toBe(raw.options.url);
      expect(owned.duplicates).toHaveLength(1);
      expect(owned.duplicates[0]!.options.url).toBe(raw.options.url);
    } finally {
      await backend.close(true);
    }
    expect(raw.destroy).not.toHaveBeenCalled();
    expect(raw.quit).not.toHaveBeenCalled();
    expect(raw.connect).not.toHaveBeenCalled();
    expect(raw.duplicates[0]!.destroy).toHaveBeenCalledOnce();
    expect(raw.duplicates[0]!.duplicates[0]!.destroy).toHaveBeenCalledOnce();
  },
);

it('keeps official ioredis adapters intact during validation', () => {
  const raw = new Redis({
    host: 'target.example',
    port: 6399,
    lazyConnect: true,
  });
  const adapter = createIORedisClient(raw);
  try {
    expect(resolveRedisConnection(adapter)).toBe(adapter);
    expect(raw.status).toBe('wait');
  } finally {
    raw.disconnect();
  }
});

it('keeps native single/bulk receipt IDs as strings and invalidates every concurrent abandoned operation', async () => {
  vi.useFakeTimers();
  const raw = new NativeClient();
  const queue = new Queue(
    'native-receipts',
    { connection: raw },
    createServiceRedisBackend,
  );
  queue.on('error', () => {});
  try {
    await queue.waitUntilReady();
    expect((await queue.add('one', {})).id).toBe('job-id');
    expect(
      (
        await queue.addBulk([
          { name: 'two', data: {} },
          { name: 'three', data: {} },
        ])
      ).map((job) => job.id),
    ).toEqual(['bulk-0', 'bulk-1']);
    const owned = raw.duplicates[0]!;
    owned.evalSha.mockImplementation(
      () =>
        new Promise((_, reject) => {
          owned.once('end', () => reject(new Error('Disconnects client')));
        }),
    );
    const pending = Promise.allSettled([
      queue.add('lost-one', {}),
      queue.add('lost-two', {}),
    ]);
    await vi.advanceTimersByTimeAsync(10000);
    const results = await pending;
    expect(results.map((result) => result.status)).toEqual([
      'rejected',
      'rejected',
    ]);
    expect(owned.destroy).toHaveBeenCalledOnce();
    await expect(queue.add('after-invalidation', {})).rejects.toThrow();
    expect(raw.destroy).not.toHaveBeenCalled();
  } finally {
    await queue.close();
  }
});

it('coordinates official node-redis adapter reconnect only on owned regular/blocking clients', async () => {
  vi.useFakeTimers();
  const raw = new NativeClient();
  const backend = createServiceRedisBackend(
    'native-reconnect',
    { connection: createNodeRedisClient(raw) },
    { withBlockingConnection: true },
  );
  backend.on('error', () => {});
  await backend.waitUntilReady();
  const regular = raw.duplicates[0]!;
  const blocking = regular.duplicates[0]!;
  try {
    regular.isReady = false;
    blocking.isReady = false;
    await vi.advanceTimersByTimeAsync(10500);
    expect(regular.connect).toHaveBeenCalledOnce();
    expect(blocking.connect).toHaveBeenCalledOnce();
    expect(regular.isReady).toBe(true);
    expect(blocking.isReady).toBe(true);
    expect(raw.connect).not.toHaveBeenCalled();
    expect(raw.destroy).not.toHaveBeenCalled();
  } finally {
    await backend.close(true);
  }
  await vi.advanceTimersByTimeAsync(30000);
  expect(regular.connect).toHaveBeenCalledOnce();
  expect(blocking.connect).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});
