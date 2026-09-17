import { describe, expect, it } from 'vitest';
import { createQueueService } from '../src/service.js';

it('keeps a producer usable while a running handler finishes during shutdown', async () => {
  const service = createQueueService({ namespace: 'shutdown' });
  const producer = service.producer('jobs');
  let release = (): void => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let entered = false;
  let published = false;
  service.consumer('jobs').consume(async () => {
    entered = true;
    await gate;
    await producer.publish('follow-up', {});
    published = true;
  });
  await service.setup();
  await producer.publish('initial', {});
  await expect.poll(() => entered).toBe(true);
  const closing = service.shutdown();
  release();
  await closing;
  expect(published).toBe(true);
  await expect(producer.publish('late', {})).rejects.toThrow();
});

describe('shutdown idempotency', () => {
  it('returns the same shutdown promise to concurrent callers', async () => {
    const service = createQueueService({ namespace: 'shutdown' });
    service.producer('jobs');
    await service.setup();
    const first = service.shutdown();
    const second = service.shutdown();
    await Promise.all([first, second]);
    expect(first).toBe(second);
  });
});
