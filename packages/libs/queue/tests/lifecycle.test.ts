import { afterEach, expect, it, vi } from 'vitest';
import { settlesWithin } from '../src/lifecycle.js';

afterEach(() => vi.useRealTimers());

it('clears the deadline timer on fulfillment and rejection', async () => {
  vi.useFakeTimers();
  expect(await settlesWithin(Promise.resolve(), 500)).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
  const error = new Error('operation failed');
  await expect(settlesWithin(Promise.reject(error), 500)).rejects.toBe(error);
  expect(vi.getTimerCount()).toBe(0);
});

it('reports expiration without cancelling the observed operation and handles its late failure', async () => {
  vi.useFakeTimers();
  let reject = (_error: Error): void => {};
  const operation = new Promise<void>((_resolve, fail) => {
    reject = fail;
  });
  const waiting = settlesWithin(operation, 50);
  await vi.advanceTimersByTimeAsync(50);
  expect(await waiting).toBe(false);
  expect(vi.getTimerCount()).toBe(0);
  reject(new Error('late failure'));
  await Promise.resolve();
});
