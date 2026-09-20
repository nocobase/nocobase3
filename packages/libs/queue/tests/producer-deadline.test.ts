import { Queue } from 'bullmq';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createQueueProducer } from '../src/producer.js';
import { createInMemoryBackendFactory } from '../src/backends/in-memory/index.js';
import { resolveQueueConfiguration } from '../src/config.js';
import type { ProducerQueue } from '../src/producer.js';
import type { QueueProducer } from '../src/service.js';
import { producerDeadline } from '../src/operation-deadline.js';

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

type Kind = 'single' | 'bulk';
function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}
async function publish(
  producer: QueueProducer,
  kind: Kind,
  message: unknown = {},
) {
  return kind === 'single'
    ? producer.publish('work', message)
    : producer.publishMany([{ channel: 'work', message }]);
}
function observe<T>(promise: Promise<T>) {
  const settled = vi.fn();
  const done = promise.then(
    (value) => settled({ value }),
    (error: unknown) => settled({ error }),
  );
  return { settled, done };
}

describe.each(['single', 'bulk'] as const)(
  '%s bounded producer wait',
  (kind) => {
    let queue: ProducerQueue;
    beforeEach(async () => {
      queue = new Queue(
        'bounded',
        { connection: {} },
        createInMemoryBackendFactory(),
      );
      await queue.waitUntilReady();
      vi.useFakeTimers({
        toFake: ['setTimeout', 'clearTimeout', 'performance', 'Date'],
      });
    });
    afterEach(async () => {
      vi.restoreAllMocks();
      vi.useRealTimers();
      await queue.close();
    });
    function fixture(ready: () => Promise<ProducerQueue> = async () => queue) {
      const finish = vi.fn();
      const begin = vi.fn(() => finish);
      const producer = createQueueProducer({
        name: 'bounded',
        queue: ready,
        beginOperation: begin,
        configuration: () =>
          resolveQueueConfiguration({ namespace: 'test' }, 'bounded'),
      });
      return { producer, finish, begin };
    }
    function stallDispatch() {
      const pending = deferred<void>();
      const add = vi.spyOn(queue, 'add');
      const bulk = vi.spyOn(queue, 'addBulk');
      let first = true;
      if (kind === 'single')
        add.mockImplementation(async (...args) => {
          if (first) {
            first = false;
            await pending.promise;
          }
          return Queue.prototype.add.apply(queue, args);
        });
      else
        bulk.mockImplementation(async (...args) => {
          if (first) {
            first = false;
            await pending.promise;
          }
          return Queue.prototype.addBulk.apply(queue, args);
        });
      return { pending, add, bulk };
    }

    it.each(['resolve', 'reject'] as const)(
      'bounds stalled initialization and observes late %s without dispatch',
      async (settlement) => {
        const ready = deferred<ProducerQueue>();
        const initialize = vi.fn(() => ready.promise);
        const { producer, finish, begin } = fixture(initialize);
        const serialize = vi.fn(() => ({}));
        const add = vi.spyOn(queue, 'add');
        const bulk = vi.spyOn(queue, 'addBulk');
        const close = vi.spyOn(queue, 'close');
        const { settled, done } = observe(
          publish(producer, kind, { toJSON: serialize }),
        );
        await vi.advanceTimersByTimeAsync(9999);
        expect(settled).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1);
        expect(settled).toHaveBeenCalledExactlyOnceWith({
          error: expect.objectContaining({
            message: expect.stringContaining('producer deadline'),
          }),
        });
        expect(begin).toHaveBeenCalledTimes(1);
        expect(finish).not.toHaveBeenCalled();
        expect(vi.getTimerCount()).toBe(0);
        if (settlement === 'resolve') ready.resolve(queue);
        else ready.reject(new Error('late initialization failure'));
        await vi.advanceTimersByTimeAsync(0);
        await done;
        expect(finish).toHaveBeenCalledTimes(1);
        expect(serialize).not.toHaveBeenCalled();
        expect(add).not.toHaveBeenCalled();
        expect(bulk).not.toHaveBeenCalled();
        expect(close).not.toHaveBeenCalled();
        expect(initialize).toHaveBeenCalledTimes(1);
        initialize.mockResolvedValue(queue);
        await publish(producer, kind);
        expect(finish).toHaveBeenCalledTimes(2);
      },
    );

    it.each(['resolve', 'reject'] as const)(
      'keeps accepted dispatch tracked until late %s, without retrying or closing',
      async (settlement) => {
        const { producer, finish, begin } = fixture();
        const { pending, add, bulk } = stallDispatch();
        const close = vi.spyOn(queue, 'close');
        const { settled, done } = observe(publish(producer, kind));
        await vi.advanceTimersByTimeAsync(9999);
        expect(settled).not.toHaveBeenCalled();
        expect(kind === 'single' ? add : bulk).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(1);
        expect(settled).toHaveBeenCalledExactlyOnceWith({
          error: expect.objectContaining({
            message: expect.stringContaining('producer deadline'),
          }),
        });
        expect(begin).toHaveBeenCalledTimes(1);
        expect(finish).not.toHaveBeenCalled();
        expect(close).not.toHaveBeenCalled();
        expect(vi.getTimerCount()).toBe(0);
        if (settlement === 'resolve') pending.resolve();
        else pending.reject(new Error('late dispatch failure'));
        await vi.advanceTimersByTimeAsync(0);
        await done;
        expect(finish).toHaveBeenCalledTimes(1);
        expect(settled).toHaveBeenCalledTimes(1);
        expect(kind === 'single' ? add : bulk).toHaveBeenCalledTimes(1);
        expect(close).not.toHaveBeenCalled();
        await publish(producer, kind);
        expect(finish).toHaveBeenCalledTimes(2);
        expect(vi.getTimerCount()).toBe(0);
      },
    );

    it('shares one absolute monotonic budget across initialization, preparation and dispatch and preserves ALS', async () => {
      const ready = deferred<ProducerQueue>();
      const contexts: (number | undefined)[] = [];
      const { producer, finish } = fixture(async () => {
        contexts.push(producerDeadline.getStore());
        await ready.promise;
        contexts.push(producerDeadline.getStore());
        return queue;
      });
      const { pending, add, bulk } = stallDispatch();
      // Capture the async context at the actual Queue method boundary.
      if (kind === 'single') {
        const implementation = add.getMockImplementation()!;
        add.mockImplementation(async (...args) => {
          contexts.push(producerDeadline.getStore());
          return implementation(...args);
        });
      } else {
        const implementation = bulk.getMockImplementation()!;
        bulk.mockImplementation(async (...args) => {
          contexts.push(producerDeadline.getStore());
          return implementation(...args);
        });
      }
      const { settled } = observe(
        publish(producer, kind, {
          toJSON: () => {
            vi.advanceTimersByTime(1000);
            return {};
          },
        }),
      );
      expect(producerDeadline.getStore()).toBeUndefined();
      await vi.advanceTimersByTimeAsync(6000);
      ready.resolve(queue);
      await vi.advanceTimersByTimeAsync(0);
      expect(performance.now()).toBe(7000);
      expect(contexts).toEqual([10000, 10000, 10000]);
      vi.setSystemTime(new Date('2099-01-01'));
      await vi.advanceTimersByTimeAsync(2999);
      expect(settled).not.toHaveBeenCalled();
      vi.setSystemTime(new Date('1999-01-01'));
      await vi.advanceTimersByTimeAsync(1);
      expect(settled).toHaveBeenCalledExactlyOnceWith({
        error: expect.objectContaining({
          message: expect.stringContaining('producer deadline'),
        }),
      });
      expect(finish).not.toHaveBeenCalled();
      pending.resolve();
      await vi.advanceTimersByTimeAsync(0);
      expect(finish).toHaveBeenCalledTimes(1);
    });

    it('rejects a dispatch result after expiry even before the timer gets a turn', async () => {
      const { producer, finish } = fixture();
      const { pending } = stallDispatch();
      const { settled, done } = observe(publish(producer, kind));
      await vi.advanceTimersByTimeAsync(0);
      vi.spyOn(performance, 'now').mockReturnValue(10000);
      pending.resolve();
      await done;
      expect(settled).toHaveBeenCalledExactlyOnceWith({
        error: expect.objectContaining({
          message: expect.stringContaining('producer deadline'),
        }),
      });
      expect(finish).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    });

    it.each(['initialization', 'preparation', 'dispatch'] as const)(
      'preserves prompt %s errors and releases tracking and timers',
      async (phase) => {
        const error = new Error('prompt failure');
        const { producer, finish } = fixture(() => {
          if (phase === 'initialization') throw error;
          return Promise.resolve(queue);
        });
        if (phase === 'dispatch') {
          if (kind === 'single')
            vi.spyOn(queue, 'add').mockRejectedValue(error);
          else vi.spyOn(queue, 'addBulk').mockRejectedValue(error);
        }
        await expect(
          publish(
            producer,
            kind,
            phase === 'preparation'
              ? {
                  toJSON: () => {
                    throw error;
                  },
                }
              : {},
          ),
        ).rejects.toThrow('prompt failure');
        expect(finish).toHaveBeenCalledTimes(1);
        expect(vi.getTimerCount()).toBe(0);
      },
    );
  },
);
