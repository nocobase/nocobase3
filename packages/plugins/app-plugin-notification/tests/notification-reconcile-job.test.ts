import { createLogger } from '@nocobase/logging';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { NotificationReconcileJob } from '../server/notification-reconcile-job.js';

describe('NotificationReconcileJob', () => {
  afterEach(() => vi.useRealTimers());

  it('owns an idempotent periodic execution lifecycle', async () => {
    vi.useFakeTimers();
    const execute = vi.fn(async (): Promise<void> => undefined);
    const job = new NotificationReconcileJob({
      intervalMs: 30_000,
      logger: createLogger({ level: 'silent' }),
      execute,
    });

    job.start();
    job.start();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(execute).toHaveBeenCalledOnce();

    job.stop();
    job.stop();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(execute).toHaveBeenCalledOnce();
  });

  it('logs execution failures without stopping later runs', async () => {
    vi.useFakeTimers();
    const error = new Error('reconcile failed');
    const execute = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(error)
      .mockResolvedValue(undefined);
    const logger = createLogger({ level: 'silent' });
    const logError = vi.spyOn(logger, 'error');
    const job = new NotificationReconcileJob({
      intervalMs: 30_000,
      logger,
      execute,
    });

    job.start();
    await vi.advanceTimersByTimeAsync(60_000);
    job.stop();

    expect(execute).toHaveBeenCalledTimes(2);
    expect(logError).toHaveBeenCalledWith(
      { event: 'notification.reconcile_failed', err: error },
      'Notification reconciliation failed.',
    );
  });
});
