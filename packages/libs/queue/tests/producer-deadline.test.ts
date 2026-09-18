import { Queue } from 'bullmq';
import { expect, it, vi } from 'vitest';
import { createQueueProducer } from '../src/producer.js';
import { createInMemoryBackendFactory } from '../src/backends/in-memory/index.js';
import { resolveQueueConfiguration } from '../src/config.js';

it.each(['single', 'bulk'] as const)(
  'rejects %s before submission when synchronous preparation consumes the request budget',
  async (kind) => {
    const queue = new Queue(
      'deadline',
      { connection: {} },
      createInMemoryBackendFactory(),
    );
    let now = 0;
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => now);
    const producer = createQueueProducer({
      name: 'deadline',
      queue: async () => queue,
      configuration: () =>
        resolveQueueConfiguration({ namespace: 'test' }, 'deadline'),
    });
    const message = {
      toJSON: () => {
        now = 10001;
        return { value: 1 };
      },
    };
    const single = vi.spyOn(queue, 'add');
    const bulk = vi.spyOn(queue, 'addBulk');
    try {
      await expect(
        kind === 'single'
          ? producer.publish('work', message)
          : producer.publishMany([{ channel: 'work', message }]),
      ).rejects.toThrow('producer deadline');
      expect(single).not.toHaveBeenCalled();
      expect(bulk).not.toHaveBeenCalled();
    } finally {
      clock.mockRestore();
      await queue.close();
    }
  },
);

it('does not serialize or dispatch after lazy initialization consumes the producer budget', async () => {
  const queue = new Queue(
    'lazy',
    { connection: {} },
    createInMemoryBackendFactory(),
  );
  let now = 0;
  const clock = vi.spyOn(performance, 'now').mockImplementation(() => now);
  const serialize = vi.fn(() => ({ value: 1 }));
  const add = vi.spyOn(queue, 'add');
  const producer = createQueueProducer({
    name: 'lazy',
    queue: async () => {
      now = 10001;
      return queue;
    },
    configuration: () =>
      resolveQueueConfiguration({ namespace: 'test' }, 'lazy'),
  });
  try {
    await expect(
      producer.publish('work', { toJSON: serialize }),
    ).rejects.toThrow('producer deadline');
    expect(serialize).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
  } finally {
    clock.mockRestore();
    await queue.close();
  }
});
