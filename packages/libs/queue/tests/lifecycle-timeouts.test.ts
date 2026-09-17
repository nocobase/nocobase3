import { expect, it } from 'vitest';
import { createQueueService } from '../src/service.js';

it('sends a shutdown signal after the first budget and lets a cooperative handler settle', async () => {
  const service = createQueueService({
    namespace: 'timeouts',
    shutdownTimeoutMs: 20,
    cancellationGraceMs: 500,
  });
  let received: AbortSignal | undefined;
  let release = (): void => {};
  service.consumer('jobs').consume(async (_channel, _message, signal) => {
    received = signal;
    await new Promise<void>((resolve) => {
      release = resolve;
      signal.addEventListener('abort', () => resolve(), { once: true });
    });
  });
  await service.setup();
  await service.producer('jobs').publish('event', {});
  await expect.poll(() => received !== undefined).toBe(true);
  const closing = service.shutdown();
  try {
    await expect.poll(() => received?.aborted, { timeout: 1000 }).toBe(true);
    await closing;
  } finally {
    release();
    await closing;
  }
});

it('rejects after grace without claiming an uncooperative handler has terminated', async () => {
  const service = createQueueService({
    namespace: 'uncooperative',
    shutdownTimeoutMs: 10,
    cancellationGraceMs: 20,
  });
  let release = (): void => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let entered = false;
  let exited = false;
  service.consumer('jobs').consume(async () => {
    entered = true;
    await gate;
    exited = true;
  });
  await service.setup();
  const producer = service.producer('jobs');
  await producer.publish('event', {});
  await expect.poll(() => entered).toBe(true);
  let rejected = false;
  const closing = service.shutdown().catch(() => {
    rejected = true;
  });
  try {
    await expect.poll(() => rejected, { timeout: 1000 }).toBe(true);
    expect(exited).toBe(false);
    await expect(producer.publish('late', {})).rejects.toThrow();
  } finally {
    release();
    await closing;
  }
  await expect.poll(() => exited).toBe(true);
});

it('still waits for a handler whose unregister already paused the Worker', async () => {
  const service = createQueueService({
    namespace: 'paused',
    shutdownTimeoutMs: 10,
    cancellationGraceMs: 20,
  });
  let release = (): void => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let entered = false;
  const off = service.consumer('jobs').consume(async () => {
    entered = true;
    await gate;
  });
  await service.setup();
  await service.producer('jobs').publish('event', {});
  await expect.poll(() => entered).toBe(true);
  const unregistering = off();
  let state = 'pending';
  const closing = service.shutdown().then(
    () => {
      state = 'success';
    },
    () => {
      state = 'failure';
    },
  );
  try {
    await expect.poll(() => state, { timeout: 1000 }).toBe('failure');
  } finally {
    release();
    await Promise.all([closing, unregistering]);
  }
});
