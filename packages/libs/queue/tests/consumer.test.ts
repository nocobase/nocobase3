import { describe, expect, it } from 'vitest';
import { createQueueHandlerRegistry } from '../src/consumer.js';

function barrier() {
  let release = (): void => {};
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release: () => release() };
}

describe('handler registration and snapshot dispatch', () => {
  it('runs all handlers even after a synchronous throw and waits for the slowest', async () => {
    const registry = createQueueHandlerRegistry();
    const slow = barrier();
    const calls: string[] = [];
    registry.consume(() => {
      calls.push('throw');
      throw new Error('first failure');
    });
    registry.consume(async () => {
      calls.push('slow');
      await slow.promise;
      calls.push('settled');
    });
    let settled = false;
    const dispatch = registry
      .dispatch('event', {}, new AbortController().signal)
      .finally(() => {
        settled = true;
      });
    void dispatch.catch(() => {});
    await Promise.resolve();
    expect(calls).toEqual(['throw', 'slow']);
    expect(settled).toBe(false);
    slow.release();
    await expect(dispatch).rejects.toThrow();
    expect(calls).toContain('settled');
  });

  it('does not include registrations added after a dispatch snapshot', async () => {
    const registry = createQueueHandlerRegistry();
    const gate = barrier();
    const calls: string[] = [];
    registry.consume(async () => {
      calls.push('first');
      await gate.promise;
    });
    const pending = registry.dispatch(
      'event',
      {},
      new AbortController().signal,
    );
    registry.consume(async () => {
      calls.push('later');
    });
    gate.release();
    await pending;
    expect(calls).toEqual(['first']);
    await registry.dispatch('event', {}, new AbortController().signal);
    expect(calls).toEqual(['first', 'first', 'later']);
  });

  it('unregisters each occurrence independently and waits for its in-flight invocation', async () => {
    const registry = createQueueHandlerRegistry();
    const gate = barrier();
    const handler = async () => {
      await gate.promise;
    };
    const off = registry.consume(handler);
    registry.consume(handler);
    const dispatch = registry.dispatch(
      'event',
      {},
      new AbortController().signal,
    );
    let done = false;
    const removed = off().then(() => {
      done = true;
    });
    expect(registry.size()).toBe(1);
    await Promise.resolve();
    expect(done).toBe(false);
    gate.release();
    await Promise.all([dispatch, removed, off()]);
    expect(registry.size()).toBe(1);
  });
});
