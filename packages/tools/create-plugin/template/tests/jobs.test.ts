import { setImmediate } from 'node:timers/promises';
import { queueServiceToken } from '@nocobase/app-server/queue';
import { createQueueService } from '@nocobase/queue';
import { ServiceContainer } from '@nocobase/service-provider';
import { describe, expect, it, vi } from 'vitest';

import {
  __NOCOBASE_SYMBOL_NAME__Handler,
  __NOCOBASE_MODULE_NAME__Channel,
  __NOCOBASE_MODULE_NAME__Queue,
  publish__NOCOBASE_SYMBOL_NAME__,
} from '../server/jobs/__NOCOBASE_SHORT_NAME__.js';
import { __NOCOBASE_SYMBOL_NAME__JobsProvider } from '../server/providers/__NOCOBASE_SHORT_NAME__-jobs.js';

function createFixture() {
  const container = new ServiceContainer();
  const queue = createQueueService({
    namespace: 'plugin-test',
    queueBackend: 'inMemory',
  });
  container.instance(queueServiceToken, queue);
  const provider = new __NOCOBASE_SYMBOL_NAME__JobsProvider({ container });
  return { container, queue, provider };
}

describe(__NOCOBASE_PACKAGE_NAME_LITERAL__, () => {
  it('filters channels and validates messages and cancellation', async () => {
    const handler = new __NOCOBASE_SYMBOL_NAME__Handler();
    const controller = new AbortController();
    await expect(
      handler.handle('unrelated', null, controller.signal),
    ).resolves.toBeUndefined();
    await expect(
      handler.handle(__NOCOBASE_MODULE_NAME__Channel, null, controller.signal),
    ).rejects.toThrow('requestedAt');
    await expect(
      handler.handle(
        __NOCOBASE_MODULE_NAME__Channel,
        { requestedAt: 'now' },
        controller.signal,
      ),
    ).resolves.toBeUndefined();
    controller.abort();
    await expect(
      handler.handle(
        __NOCOBASE_MODULE_NAME__Channel,
        { requestedAt: 'now' },
        controller.signal,
      ),
    ).rejects.toThrow();
  });

  it('publishes through the shared service and consumes asynchronously after setup', async () => {
    const { container, queue, provider } = createFixture();
    const handled = vi.spyOn(
      __NOCOBASE_SYMBOL_NAME__Handler.prototype,
      'handle',
    );
    try {
      await provider.boot();
      expect(handled).not.toHaveBeenCalled();
      await expect(
        publish__NOCOBASE_SYMBOL_NAME__(container, { requestedAt: 'now' }),
      ).rejects.toThrow('not ready');
      await queue.setup();
      const receipt = await publish__NOCOBASE_SYMBOL_NAME__(container, {
        requestedAt: 'now',
      });
      expect(receipt.jobId).toEqual(expect.any(String));
      await expect
        .poll(() => handled.mock.settledResults[0]?.type)
        .toBe('fulfilled');
      expect(handled).toHaveBeenCalledWith(
        __NOCOBASE_MODULE_NAME__Channel,
        { requestedAt: 'now' },
        expect.any(AbortSignal),
      );
    } finally {
      await provider.shutdown();
      await queue.shutdown();
      handled.mockRestore();
    }
  });

  it('keeps handler instances and shutdown isolated between applications', async () => {
    const first = createFixture();
    const second = createFixture();
    const handled = vi.spyOn(
      __NOCOBASE_SYMBOL_NAME__Handler.prototype,
      'handle',
    );
    try {
      await first.provider.boot();
      await second.provider.boot();
      await first.queue.setup();
      await second.queue.setup();
      await publish__NOCOBASE_SYMBOL_NAME__(first.container, {
        requestedAt: 'first',
      });
      await expect
        .poll(() => handled.mock.settledResults[0]?.type)
        .toBe('fulfilled');
      await first.provider.shutdown();
      await first.queue.shutdown();
      await publish__NOCOBASE_SYMBOL_NAME__(second.container, {
        requestedAt: 'second',
      });
      await expect
        .poll(() => handled.mock.settledResults[1]?.type)
        .toBe('fulfilled');
      expect(handled.mock.contexts[0]).not.toBe(handled.mock.contexts[1]);
      expect(handled.mock.calls.map((call) => call[1])).toEqual([
        { requestedAt: 'first' },
        { requestedAt: 'second' },
      ]);
    } finally {
      await first.provider.shutdown();
      await first.queue.shutdown();
      await second.provider.shutdown();
      await second.queue.shutdown();
      handled.mockRestore();
    }
  });

  it('awaits active handler unregistration without closing the shared service', async () => {
    const { container, queue, provider } = createFixture();
    const release = Promise.withResolvers<void>();
    const handled = vi
      .spyOn(__NOCOBASE_SYMBOL_NAME__Handler.prototype, 'handle')
      .mockImplementation(async () => {
        await release.promise;
      });
    let shutdown: Promise<void> | undefined;
    try {
      await provider.boot();
      await queue.setup();
      await publish__NOCOBASE_SYMBOL_NAME__(container, { requestedAt: 'now' });
      await expect.poll(() => handled.mock.calls.length).toBe(1);
      let stopped = false;
      shutdown = provider.shutdown().then(() => {
        stopped = true;
      });
      await setImmediate();
      expect(stopped).toBe(false);
      release.resolve();
      await shutdown;
      await provider.shutdown();
      // A replacement consumer proves this Provider did not close the shared queue.
      const replacement = vi.fn(async (): Promise<void> => {});
      const unregister = queue
        .consumer(__NOCOBASE_MODULE_NAME__Queue)
        .consume(replacement);
      try {
        await publish__NOCOBASE_SYMBOL_NAME__(container, {
          requestedAt: 'later',
        });
        await expect.poll(() => replacement.mock.calls.length).toBe(1);
        expect(handled).toHaveBeenCalledTimes(1);
      } finally {
        await unregister();
      }
    } finally {
      release.resolve();
      await shutdown;
      await provider.shutdown();
      await queue.shutdown();
      handled.mockRestore();
    }
  });
});
