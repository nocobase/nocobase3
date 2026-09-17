import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MemoryWaiter,
  MemoryWorkerState,
} from '../../src/backends/in-memory/worker.js';

afterEach(() => vi.useRealTimers());

describe('memory delayed wait scheduling', () => {
  it('rearms to an earlier insertion and clears every timer and listener after completion', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const state = new MemoryWorkerState();
    const waiter = new MemoryWaiter(state);
    let due = 1000;
    const pending = waiter.wait(
      10,
      () => (Date.now() >= due ? 'job' : undefined),
      () => due,
    );
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(50);
    due = 100;
    state.notify();
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(50);
    expect(await pending).toEqual({ member: 'job', score: 0 });
    expect(state.listeners.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('does not extend the original deadline when repeatedly notified and cancels all waits', async () => {
    vi.useFakeTimers();
    const state = new MemoryWorkerState();
    const waiter = new MemoryWaiter(state);
    const pending = waiter.wait(1, () => undefined);
    await vi.advanceTimersByTimeAsync(900);
    state.notify();
    await vi.advanceTimersByTimeAsync(100);
    expect(await pending).toBeNull();
    const waits = [
      waiter.wait(10, () => undefined),
      waiter.wait(20, () => undefined),
    ];
    waiter.disconnect();
    expect(await Promise.all(waits)).toEqual([null, null]);
    expect(state.listeners.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});
