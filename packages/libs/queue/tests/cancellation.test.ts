import { UnrecoverableError } from 'bullmq';
import { describe, expect, it } from 'vitest';
import { QueueCancellation } from '../src/cancellation.js';

function barrier() {
  let release = (): void => {};
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release: () => release() };
}

describe('local permanent cancellation', () => {
  it('signals immediately but waits for dispatch and rejects even if dispatch ignores abort', async () => {
    const cancellation = new QueueCancellation();
    const gate = barrier();
    let received: AbortSignal | undefined;
    let finished = false;
    const pending = cancellation
      .run('job', new AbortController().signal, async (signal) => {
        received = signal;
        await gate.promise;
      })
      .finally(() => {
        finished = true;
      });
    void pending.catch(() => {});
    expect(cancellation.cancelJob('missing')).toBe(false);
    expect(cancellation.cancelJob('job', 'user stop')).toBe(true);
    expect(received?.aborted).toBe(true);
    await Promise.resolve();
    expect(finished).toBe(false);
    gate.release();
    await expect(pending).rejects.toBeInstanceOf(UnrecoverableError);
    expect(cancellation.cancelJob('job')).toBe(false);
  });
  it('cancels only this instance active jobs and does not affect later jobs', async () => {
    const local = new QueueCancellation();
    const remote = new QueueCancellation();
    const gate = barrier();
    const signals: AbortSignal[] = [];
    const dispatch = async (signal: AbortSignal) => {
      signals.push(signal);
      await gate.promise;
    };
    const jobs = [
      local.run('a', new AbortController().signal, dispatch),
      local.run('b', new AbortController().signal, dispatch),
      remote.run('a', new AbortController().signal, dispatch),
    ];
    const result = Promise.allSettled(jobs);
    local.cancelAllJobs();
    expect(signals.map((signal) => signal.aborted)).toEqual([
      true,
      true,
      false,
    ]);
    gate.release();
    expect((await result).map((value) => value.status)).toEqual([
      'rejected',
      'rejected',
      'fulfilled',
    ]);
    await expect(
      local.run('next', new AbortController().signal, async (signal) => {
        expect(signal.aborted).toBe(false);
      }),
    ).resolves.toBeUndefined();
  });
  it('does not convert shutdown abort into a permanent user cancellation', async () => {
    const cancellation = new QueueCancellation();
    const shutdown = new AbortController();
    const gate = barrier();
    const error = new Error('shutdown interrupted dispatch');
    const pending = cancellation.run('job', shutdown.signal, async () => {
      await gate.promise;
      throw error;
    });
    shutdown.abort();
    gate.release();
    await expect(pending).rejects.toBe(error);
    expect(cancellation.cancelJob('job')).toBe(false);
  });
});
