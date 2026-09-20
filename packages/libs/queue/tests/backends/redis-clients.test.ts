import { EventEmitter } from 'node:events';
import { createNodeRedisClient, Queue, Worker } from 'bullmq';
import { expect, it, vi } from 'vitest';
import { createBackendRegistry } from '../../src/backends/registry.js';
import { resolveQueueConfiguration } from '../../src/config.js';

/** Already-ready native client double; no sockets or reconnect timers. */
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
  quit = vi.fn(async () => {
    this.isOpen = false;
    this.isReady = false;
    this.emit('end');
    return 'OK';
  });
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

it('preserves a non-enumerable native connection during read-only configuration', () => {
  const raw = new NativeClient();
  for (const key of Object.keys(raw))
    Object.defineProperty(raw, key, { enumerable: false });
  const resolved = resolveQueueConfiguration(
    { namespace: 'app', queueBackend: 'redis', connection: raw },
    'email',
  );
  expect(resolved.connection).toBe(raw);
  expect(raw.connect).not.toHaveBeenCalled();
  expect(raw.duplicate).not.toHaveBeenCalled();
  expect(raw.eventNames()).toEqual([]);
});

it('does not add listeners or duplicate an explicitly adapted native client during configuration', () => {
  const raw = new NativeClient();
  const connection = createNodeRedisClient(raw);
  const listeners = raw.eventNames().map((event) => raw.listenerCount(event));
  expect(
    resolveQueueConfiguration(
      { namespace: 'app', queueBackend: 'redis', connection },
      'email',
    ).connection,
  ).toBe(connection);
  expect(raw.eventNames().map((event) => raw.listenerCount(event))).toEqual(
    listeners,
  );
  expect(raw.connect).not.toHaveBeenCalled();
  expect(raw.duplicate).not.toHaveBeenCalled();
});

it('uses explicit native adaptation and lets public Worker close own only its blocking duplicate', async () => {
  const raw = new NativeClient();
  const connection = createNodeRedisClient(raw);
  const factory = createBackendRegistry().resolve('redis');
  const queue = new Queue('native-ownership', { connection }, factory);
  const worker = new Worker(
    'native-ownership',
    async () => {},
    { connection, autorun: false },
    factory,
  );
  try {
    await queue.waitUntilReady();
    await worker.waitUntilReady();
    expect(raw.duplicate).toHaveBeenCalledOnce();
    expect(raw.duplicates[0]!.duplicates).toHaveLength(0);
    expect(raw.duplicates[0]!.options.url).toBe(raw.options.url);
  } finally {
    await worker.close(true);
    await queue.close();
  }
  expect(raw.destroy).not.toHaveBeenCalled();
  expect(raw.quit).not.toHaveBeenCalled();
  expect(raw.connect).not.toHaveBeenCalled();
  expect(raw.duplicates[0]!.destroy).toHaveBeenCalledOnce();
  expect(raw.isReady).toBe(true);
  raw.destroy();
});

it('preserves official native single/bulk IDs without permanently invalidating a shared client after a command rejection', async () => {
  const raw = new NativeClient();
  const queue = new Queue(
    'native-receipts',
    { connection: createNodeRedisClient(raw) },
    createBackendRegistry().resolve('redis'),
  );
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
    raw.evalSha.mockRejectedValueOnce(new Error('Command failed'));
    await expect(queue.add('failed', {})).rejects.toThrow('Command failed');
    expect((await queue.add('later', {})).id).toBe('job-id');
    expect(raw.duplicate).not.toHaveBeenCalled();
  } finally {
    await queue.close();
  }
  expect(raw.destroy).not.toHaveBeenCalled();
  expect(raw.quit).not.toHaveBeenCalled();
  raw.destroy();
});
