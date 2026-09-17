import { describe, expect, it, vi } from 'vitest';
import * as queue from '../src/index.js';

describe('withChannel', () => {
  it('forwards matching channels and original message/signal, skipping others', async () => {
    const handler = vi.fn(async () => {});
    const signal = new AbortController().signal;
    const message = { id: 'a' };
    const filtered = queue.withChannel(['send', 'notify'], handler);
    await filtered('ignored', message, signal);
    expect(handler).not.toHaveBeenCalled();
    await filtered('send', message, signal);
    await filtered('notify', message, signal);
    expect(handler).toHaveBeenNthCalledWith(1, 'send', message, signal);
    expect(handler).toHaveBeenNthCalledWith(2, 'notify', message, signal);
  });

  it('supports a single channel and an empty list, preserving failures', async () => {
    const error = new Error('handler failed');
    const handler = vi.fn(async () => {
      throw error;
    });
    const signal = new AbortController().signal;
    await queue.withChannel([], handler)('send', null, signal);
    expect(handler).not.toHaveBeenCalled();
    await expect(
      queue.withChannel('send', handler)('send', null, signal),
    ).rejects.toBe(error);
  });
});
