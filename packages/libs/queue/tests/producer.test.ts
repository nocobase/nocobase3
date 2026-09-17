import { Queue } from 'bullmq';
import type { IQueueBackend } from 'bullmq';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createQueueProducer } from '../src/producer.js';
import type { ProducerQueue } from '../src/producer.js';
import { createInMemoryBackendFactory } from '../src/backends/in-memory/index.js';
import { resolveQueueConfiguration } from '../src/config.js';
import { decodeQueueMessage } from '../src/serialization.js';

const queues: ProducerQueue[] = [];
afterEach(async () => {
  await Promise.all(queues.splice(0).map((queue) => queue.close()));
});
function fixture() {
  const queue = new Queue<
    unknown,
    unknown,
    string,
    unknown,
    unknown,
    string,
    IQueueBackend
  >('encoded-physical', { connection: {} }, createInMemoryBackendFactory());
  queues.push(queue);
  const producer = createQueueProducer({
    name: 'logical:任务',
    queue: async () => queue,
    configuration: () =>
      resolveQueueConfiguration(
        { namespace: 'app', attempts: 3 },
        'logical:任务',
      ),
  });
  return { queue, producer };
}

describe('queue producer', () => {
  it('maps channel to name and returns only a jobId receipt', async () => {
    const { queue, producer } = fixture();
    const receipt = await producer.publish('orders.created', { value: 1 });
    expect(Object.keys(receipt)).toEqual(['jobId']);
    const job = await queue.getJob(receipt.jobId);
    expect(job?.name).toBe('orders.created');
    expect(decodeQueueMessage(job?.data)).toEqual({ value: 1 });
    expect(job?.opts.attempts).toBe(3);
  });
  it('passes original message and logical name to the ID producer', async () => {
    const { producer } = fixture();
    const message = { value: 1 };
    const id = vi.fn(() => 'custom');
    expect(
      await producer.publish('channel', message, { jobIdProducer: id }),
    ).toEqual({ jobId: 'custom' });
    expect(id).toHaveBeenCalledExactlyOnceWith(
      'logical:任务',
      'channel',
      message,
    );
  });
  it.each(['', ' ', '\u0000', 'a'.repeat(257)])(
    'rejects invalid channel %j before writing',
    async (channel) => {
      const { queue, producer } = fixture();
      const add = vi.spyOn(queue, 'add');
      await expect(producer.publish(channel, {})).rejects.toThrow(/channel/u);
      expect(add).not.toHaveBeenCalled();
    },
  );
  it('prepares the entire batch before exactly one addBulk call', async () => {
    const { queue, producer } = fixture();
    const bulk = vi.spyOn(queue, 'addBulk');
    const add = vi.spyOn(queue, 'add');
    await expect(
      producer.publishMany([
        { channel: 'ok', message: {} },
        { channel: 'bad', message: 1n },
      ]),
    ).rejects.toThrow();
    expect(bulk).not.toHaveBeenCalled();
    const receipts = await producer.publishMany([
      { channel: 'a', message: 1 },
      { channel: 'b', message: 2 },
    ]);
    expect(receipts).toHaveLength(2);
    expect(bulk).toHaveBeenCalledTimes(1);
    expect(add).not.toHaveBeenCalled();
    expect(await producer.publishMany([])).toEqual([]);
  });
  it('serializes toJSON only once and forwards supported job options', async () => {
    const { queue, producer } = fixture();
    let calls = 0;
    const { jobId } = await producer.publish(
      'event',
      {
        toJSON: () => {
          calls++;
          return { calls };
        },
      },
      { attempts: 5, priority: 2, delay: 100, removeOnComplete: 10 },
    );
    const job = await queue.getJob(jobId);
    expect(calls).toBe(1);
    expect(job?.opts).toMatchObject({
      attempts: 5,
      priority: 2,
      delay: 100,
      removeOnComplete: 10,
    });
  });
  it('preserves official single versus bulk ID validation and rejects before backend writes', async () => {
    const { queue, producer } = fixture();
    const writes = vi.spyOn(queue.getBackend(), 'addJobs');
    await expect(
      producer.publish('event', {}, { jobIdProducer: () => '0:a:b' }),
    ).rejects.toThrow();
    expect(
      await producer.publishMany([{ channel: 'event', message: {} }], {
        jobIdProducer: () => '0:a:b',
      }),
    ).toEqual([{ jobId: '0:a:b' }]);
    writes.mockClear();
    let count = 0;
    await expect(
      producer.publishMany(
        [
          { channel: 'event', message: {} },
          { channel: 'event', message: {} },
        ],
        { jobIdProducer: () => (++count === 1 ? 'valid' : '123') },
      ),
    ).rejects.toThrow();
    expect(writes).not.toHaveBeenCalled();
    expect(await queue.getJob('valid')).toBeUndefined();
  });
});
