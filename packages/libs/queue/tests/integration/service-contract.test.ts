import { expect, it } from 'vitest';
import { createQueueService } from '../../src/service.js';
import { createInMemoryBackendFactory } from '../../src/backends/in-memory/index.js';
import {
  createBackendHarness,
  selectedBackend,
} from '../helpers/backend-harness.js';

it('dispatches versioned payloads through the selected real backend and awaits handler removal', async () => {
  const harness = await createBackendHarness(createInMemoryBackendFactory());
  const selected = selectedBackend();
  const service = createQueueService({
    namespace: harness.namespace,
    queueBackend:
      selected === 'postgres13'
        ? 'postgres'
        : selected === 'cluster'
          ? 'redis'
          : selected,
    connection: harness.connection,
  });
  const received: unknown[] = [];
  let release = (): void => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const unregister = service
    .consumer('jobs')
    .consume(async (_channel, message) => {
      received.push(message);
      await gate;
    });
  try {
    await service.setup();
    await service.producer('jobs').publish('event', {
      version: 99,
      payload: 'business',
      text: '\u0000\ud800',
    });
    await expect.poll(() => received.length, { timeout: 5000 }).toBe(1);
    let removed = false;
    const removing = unregister().then(() => {
      removed = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(removed).toBe(false);
    release();
    await removing;
    expect(received).toEqual([
      { version: 99, payload: 'business', text: '\u0000\ud800' },
    ]);
    await service.producer('jobs').publish('event', 'late');
    const later: unknown[] = [];
    service.consumer('jobs').consume(async (_channel, message) => {
      later.push(message);
    });
    await expect.poll(() => later, { timeout: 5000 }).toEqual(['late']);
    expect(received.length).toBe(1);
  } finally {
    release();
    await service.shutdown();
    await harness.close();
  }
});

function barrier(): { promise: Promise<void>; resolve: () => void } {
  let resolve = (): void => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

it('preserves string channels independently from logical queue-name restrictions', async () => {
  const harness = await createBackendHarness(createInMemoryBackendFactory());
  const selected = selectedBackend();
  const service = createQueueService({
    namespace: harness.namespace,
    queueBackend:
      selected === 'postgres13'
        ? 'postgres'
        : selected === 'cluster'
          ? 'redis'
          : selected,
    connection: harness.connection,
  });
  const channels = ['', ' ', 'x'.repeat(257), 'line\nbreak'];
  const received: string[] = [];
  service.consumer('channels').consume(async (channel) => {
    received.push(channel);
  });
  try {
    await service.setup();
    await service
      .producer('channels')
      .publishMany(channels.map((channel) => ({ channel, message: null })));
    await expect.poll(() => received, { timeout: 5000 }).toEqual(channels);
  } finally {
    await service.shutdown();
    await harness.close();
  }
});

it('awaits every snapshot handler before retry and excludes later registrations', async () => {
  const harness = await createBackendHarness(createInMemoryBackendFactory());
  const selected = selectedBackend();
  const service = createQueueService({
    namespace: harness.namespace,
    queueBackend:
      selected === 'postgres13'
        ? 'postgres'
        : selected === 'cluster'
          ? 'redis'
          : selected,
    connection: harness.connection,
  });
  let release = (): void => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let failures = 0;
  let siblings = 0;
  let late = 0;
  service.consumer('snapshots').consume(() => {
    failures += 1;
    if (failures === 1) throw new Error('first attempt failure');
    return Promise.resolve();
  });
  service.consumer('snapshots').consume(async () => {
    siblings += 1;
    if (siblings === 1) await gate;
  });
  try {
    await service.setup();
    await service.producer('snapshots').publish('work', {}, { attempts: 2 });
    await expect.poll(() => siblings, { timeout: 5000 }).toBe(1);
    const offLate = service.consumer('snapshots').consume(async () => {
      late += 1;
    });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(failures).toBe(1);
    expect(late).toBe(0);
    release();
    await expect
      .poll(() => [failures, siblings, late], { timeout: 5000 })
      .toEqual([2, 2, 1]);
    await offLate();
  } finally {
    release();
    await service.shutdown();
    await harness.close();
  }
});

it('prepares an entire batch before writing and normalizes root JSON values once', async () => {
  const harness = await createBackendHarness(createInMemoryBackendFactory());
  const selected = selectedBackend();
  const service = createQueueService({
    namespace: harness.namespace,
    queueBackend:
      selected === 'postgres13'
        ? 'postgres'
        : selected === 'cluster'
          ? 'redis'
          : selected,
    connection: harness.connection,
  });
  const received: unknown[] = [];
  service.consumer('jobs').consume(async (_channel, message) => {
    received.push(message);
  });
  let serialized = 0;
  const producer = service.producer('jobs');
  try {
    await service.setup();
    await expect(
      producer.publishMany([
        {
          channel: 'first',
          message: {
            toJSON: () => {
              serialized++;
              return 'must not write';
            },
          },
        },
        { channel: 'second', message: 1n },
      ]),
    ).rejects.toThrow();
    expect(serialized).toBe(1);
    let ids = 0;
    await expect(
      producer.publishMany(
        [
          { channel: 'first', message: 'must not write' },
          { channel: 'second', message: 'must not write' },
        ],
        {
          jobIdProducer: () => {
            if (++ids === 2) throw new Error('ID rejected');
            return 'valid-id';
          },
        },
      ),
    ).rejects.toThrow('ID rejected');
    await producer.publishMany([
      { channel: 'root', message: null },
      { channel: 'root', message: undefined },
      { channel: 'root', message: false },
      { channel: 'root', message: 0 },
      { channel: 'root', message: ['text', null] },
    ]);
    await expect.poll(() => received.length, { timeout: 5000 }).toBe(5);
    expect(received).toEqual([null, {}, false, 0, ['text', null]]);
  } finally {
    await service.shutdown();
    await harness.close();
  }
});

it('keeps duplicate registrations independent and applies one permanent cancellation signal to a dispatch', async () => {
  const harness = await createBackendHarness(createInMemoryBackendFactory());
  const selected = selectedBackend();
  const service = createQueueService({
    namespace: harness.namespace,
    queueBackend:
      selected === 'postgres13'
        ? 'postgres'
        : selected === 'cluster'
          ? 'redis'
          : selected,
    connection: harness.connection,
    attempts: 3,
  });
  const gate = barrier();
  const signals: AbortSignal[] = [];
  const completed: unknown[] = [];
  const handler = async (
    _channel: string,
    message: unknown,
    signal: AbortSignal,
  ): Promise<void> => {
    if (message === 'cancel') {
      signals.push(signal);
      await gate.promise;
    } else completed.push(message);
  };
  const consumer = service.consumer('jobs');
  const first = consumer.consume(handler);
  consumer.consume(handler);
  try {
    await service.setup();
    const receipt = await service.producer('jobs').publish('work', 'cancel');
    await expect.poll(() => signals.length).toBe(2);
    expect(signals[0]).toBe(signals[1]);
    expect(service.manager('jobs').cancelJob('not-running')).toBe(false);
    expect(
      service.manager('jobs').cancelJob(receipt.jobId, 'user request'),
    ).toBe(true);
    expect(
      signals.every(
        (signal) => signal.aborted && signal.reason === 'user request',
      ),
    ).toBe(true);
    let removed = false;
    const removal = first().then(() => {
      removed = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(removed).toBe(false);
    gate.resolve();
    await removal;
    await service.producer('jobs').publish('work', 'after');
    await expect.poll(() => completed).toEqual(['after']);
    expect(signals).toHaveLength(2);
    expect(service.manager('jobs').cancelJob(receipt.jobId)).toBe(false);
  } finally {
    gate.resolve();
    await service.shutdown();
    await harness.close();
  }
});

it('decreases concurrency without cancelling active work and rejects invalid configuration before mutation', async () => {
  const harness = await createBackendHarness(createInMemoryBackendFactory());
  const selected = selectedBackend();
  const service = createQueueService({
    namespace: harness.namespace,
    queueBackend:
      selected === 'postgres13'
        ? 'postgres'
        : selected === 'cluster'
          ? 'redis'
          : selected,
    connection: harness.connection,
    concurrency: 2,
  });
  const gates = new Map<number, ReturnType<typeof barrier>>();
  for (const id of [1, 2, 3, 4]) gates.set(id, barrier());
  const started: number[] = [];
  const completed: number[] = [];
  const signals: AbortSignal[] = [];
  service.consumer('jobs').consume<number>(async (_channel, id, signal) => {
    started.push(id);
    signals.push(signal);
    await gates.get(id)!.promise;
    completed.push(id);
  });
  const manager = service.manager('jobs');
  try {
    await service.setup();
    await service
      .producer('jobs')
      .publishMany(
        [1, 2, 3, 4].map((id) => ({ channel: 'work', message: id })),
      );
    await expect.poll(() => started).toEqual([1, 2]);
    await manager.configure({ concurrency: 1 });
    await expect(
      manager.configure({ concurrency: 3, attempts: -1 }),
    ).rejects.toThrow();
    gates.get(1)!.resolve();
    await expect.poll(() => completed).toEqual([1]);
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(started).toEqual([1, 2]);
    expect(signals.every((signal) => !signal.aborted)).toBe(true);
    gates.get(2)!.resolve();
    await expect.poll(() => started).toEqual([1, 2, 3]);
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(started).toEqual([1, 2, 3]);
    gates.get(3)!.resolve();
    await expect.poll(() => started).toEqual([1, 2, 3, 4]);
    gates.get(4)!.resolve();
    await expect.poll(() => completed).toEqual([1, 2, 3, 4]);
  } finally {
    for (const gate of gates.values()) gate.resolve();
    await service.shutdown();
    await harness.close();
  }
});

it('applies retry defaults only to future publications', async () => {
  const harness = await createBackendHarness(createInMemoryBackendFactory());
  const selected = selectedBackend();
  const service = createQueueService({
    namespace: harness.namespace,
    queueBackend:
      selected === 'postgres13'
        ? 'postgres'
        : selected === 'cluster'
          ? 'redis'
          : selected,
    connection: harness.connection,
    attempts: 1,
  });
  const calls = new Map<string, number>();
  const success: string[] = [];
  try {
    await service.setup();
    await service.producer('jobs').publish('work', 'old');
    await service.manager('jobs').configure({ attempts: 2 });
    await service.producer('jobs').publish('work', 'new');
    service.consumer('jobs').consume<string>(async (_channel, message) => {
      const attempt = (calls.get(message) ?? 0) + 1;
      calls.set(message, attempt);
      if (attempt === 1) throw new Error('first attempt');
      success.push(message);
    });
    await expect.poll(() => success).toEqual(['new']);
    expect([...calls]).toEqual([
      ['old', 1],
      ['new', 2],
    ]);
  } finally {
    await service.shutdown();
    await harness.close();
  }
});

it('keeps rate windows independent by queue and removes a configured limit', async () => {
  const harness = await createBackendHarness(createInMemoryBackendFactory());
  const selected = selectedBackend();
  const service = createQueueService({
    namespace: harness.namespace,
    queueBackend:
      selected === 'postgres13'
        ? 'postgres'
        : selected === 'cluster'
          ? 'redis'
          : selected,
    connection: harness.connection,
  });
  const starts = new Map<string, number[]>();
  for (const queue of ['one', 'two']) {
    starts.set(queue, []);
    service.consumer(queue).consume(async () => {
      starts.get(queue)!.push(performance.now());
    });
  }
  try {
    await service.setup();
    await service
      .manager('one')
      .configure({ rateLimit: { max: 1, duration: 500 } });
    await service
      .manager('two')
      .configure({ rateLimit: { max: 1, duration: 500 } });
    await service
      .producer('one')
      .publishMany([1, 2].map((message) => ({ channel: 'work', message })));
    await service.producer('two').publish('work', 1);
    await expect
      .poll(() => [starts.get('one')!.length, starts.get('two')!.length])
      .toEqual([1, 1]);
    expect(
      Math.abs(starts.get('one')![0]! - starts.get('two')![0]!),
    ).toBeLessThan(400);
    await expect.poll(() => starts.get('one')!.length).toBe(2);
    expect(
      starts.get('one')![1]! - starts.get('one')![0]!,
    ).toBeGreaterThanOrEqual(450);
    await service.manager('one').configure({ rateLimit: null });
    await service
      .producer('one')
      .publishMany([3, 4, 5].map((message) => ({ channel: 'work', message })));
    await expect.poll(() => starts.get('one')!.length).toBe(5);
    // Removing backend policy does not interrupt an already scheduled Worker sleep.
    // Once it wakes, subsequent claims must no longer obey the removed window.
    expect(starts.get('one')![4]! - starts.get('one')![2]!).toBeLessThan(400);
  } finally {
    await service.shutdown();
    await harness.close();
  }
});

it('lazily prunes retained completions and permits reuse of a deleted job ID', async () => {
  const { Queue } = await import('bullmq');
  const { createQueueIdentity } = await import('../../src/identity.js');
  const factory = createInMemoryBackendFactory();
  const harness = await createBackendHarness(factory);
  const selected = selectedBackend();
  const service = createQueueService({
    namespace: harness.namespace,
    queueBackend:
      selected === 'inMemory'
        ? 'observed-memory'
        : selected === 'cluster'
          ? 'redis'
          : selected === 'postgres13'
            ? 'postgres'
            : selected,
    connection: harness.connection,
    removeOnComplete: { age: 1 },
  });
  if (selected === 'inMemory')
    service.registerBackend('observed-memory', factory);
  const identity = createQueueIdentity(harness.namespace, 'retention');
  const observer = new Queue(
    selected.startsWith('postgres')
      ? identity.postgresQueueName
      : identity.redisQueueName,
    { connection: harness.connection, prefix: identity.redisPrefix },
    harness.factory,
  );
  const received: string[] = [];
  service.consumer('retention').consume<string>(async (_channel, message) => {
    received.push(message);
  });
  try {
    await service.setup();
    const producer = service.producer('retention');
    const first = await producer.publish('work', 'original', {
      jobIdProducer: () => 'reusable',
    });
    await expect
      .poll(() => observer.getJobState(first.jobId))
      .toBe('completed');
    await new Promise((resolve) => setTimeout(resolve, 1100));
    expect(await observer.getJobState(first.jobId)).toBe('completed');
    await producer.publish('work', 'duplicate', {
      jobIdProducer: () => 'reusable',
    });
    const trigger = await producer.publish('work', 'prune');
    await expect
      .poll(() => observer.getJobState(trigger.jobId))
      .toBe('completed');
    await expect.poll(() => observer.getJobState(first.jobId)).toBe('unknown');
    expect(received).toEqual(['original', 'prune']);
    const reused = await producer.publish('work', 'reused', {
      jobIdProducer: () => 'reusable',
    });
    expect(reused.jobId).toBe(first.jobId);
    await expect
      .poll(() => observer.getJobState(reused.jobId))
      .toBe('completed');
    expect(received).toEqual(['original', 'prune', 'reused']);
  } finally {
    try {
      await service.shutdown();
    } finally {
      try {
        await observer.close();
      } finally {
        await harness.close();
      }
    }
  }
});
