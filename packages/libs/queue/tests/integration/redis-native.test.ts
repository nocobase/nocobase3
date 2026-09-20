import { expect, it } from 'vitest';
import { createClient } from 'redis';
import { createNodeRedisClient, Queue } from 'bullmq';
import { createQueueService } from '../../src/service.js';
import { createQueueIdentity } from '../../src/identity.js';

it('uses an explicit native adapter for delivery, receipts and shared caller ownership', async () => {
  const raw = createClient({
    url: `redis://127.0.0.1:${process.env.QUEUE_TEST_REDIS_PORT}/0`,
  });
  raw.on('error', () => {});
  await raw.connect();
  const original = JSON.stringify(raw.options);
  const connection = createNodeRedisClient(raw);
  const namespace = `${process.env.QUEUE_TEST_RUN}-native-adapter`;
  const service = createQueueService({
    namespace,
    queueBackend: 'redis',
    connection,
  });
  const messages: unknown[] = [];
  service.consumer('jobs').consume(async (_channel, message) => {
    messages.push(message);
  });
  try {
    await service.setup();
    const single = await service.producer('jobs').publish('single', 1);
    const bulk = await service.producer('jobs').publishMany([
      { channel: 'bulk', message: 2 },
      { channel: 'bulk', message: 3 },
    ]);
    expect(typeof single.jobId).toBe('string');
    expect(bulk.map((receipt) => typeof receipt.jobId)).toEqual([
      'string',
      'string',
    ]);
    await expect.poll(() => messages).toEqual([1, 2, 3]);
    await service.shutdown();
    expect(raw.isOpen).toBe(true);
    expect(await raw.ping()).toBe('PONG');
    expect(JSON.stringify(raw.options)).toBe(original);
  } finally {
    try {
      await service.shutdown();
    } finally {
      if (raw.isOpen) raw.destroy();
    }
  }
});

it('observes native late publication after the caller deadline without invalidating the adapter', async () => {
  const raw = createClient({
    url: `redis://127.0.0.1:${process.env.QUEUE_TEST_REDIS_PORT}/0`,
  });
  raw.on('error', () => {});
  await raw.connect();
  const connection = createNodeRedisClient(raw);
  const namespace = `${process.env.QUEUE_TEST_RUN}-native-late`;
  const service = createQueueService({
    namespace,
    queueBackend: 'redis',
    connection,
  });
  const identity = createQueueIdentity(namespace, 'jobs');
  const observer = new Queue(identity.redisQueueName, {
    connection,
    prefix: identity.redisPrefix,
  });
  const producer = service.producer('jobs');
  try {
    await service.setup();
    await observer.waitUntilReady();
    await raw.sendCommand(['CLIENT', 'PAUSE', '11500', 'WRITE']);
    const start = performance.now();
    const outcomes = await Promise.allSettled([
      producer.publish(
        'single',
        {},
        { jobIdProducer: () => 'native-late-single' },
      ),
      producer.publishMany([{ channel: 'bulk', message: {} }], {
        jobIdProducer: () => 'native-late-bulk',
      }),
    ]);
    expect(outcomes.map((outcome) => outcome.status)).toEqual([
      'rejected',
      'rejected',
    ]);
    for (const outcome of outcomes)
      if (outcome.status === 'rejected')
        expect(outcome.reason).toMatchObject({
          message: expect.stringContaining('deadline'),
        });
    expect(performance.now() - start).toBeLessThan(11000);
    await expect
      .poll(() => observer.getJobState('native-late-single'), { timeout: 5000 })
      .toBe('waiting');
    await expect
      .poll(() => observer.getJobState('native-late-bulk'), { timeout: 5000 })
      .toBe('waiting');
    await expect(producer.publish('after', {})).resolves.toMatchObject({
      jobId: expect.any(String),
    });
    expect(await observer.getWaitingCount()).toBe(3);
    await service.shutdown();
    expect(await raw.ping()).toBe('PONG');
  } finally {
    await service.shutdown();
    await observer.close();
    if (raw.isOpen) raw.destroy();
  }
}, 20000);
