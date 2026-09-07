import { describe, expect, it, vi } from 'vitest';
import { AuditRetentionScheduler } from '../../server/providers/retention-scheduler.js';
import { LocalAuditHealthService } from '../../server/health-service.js';

describe.each(['sync', 'async'] as const)('scheduler %s rejection', (mode) => {
  it('reports only a safe code and does not leak callback errors to Cron', async () => {
    const diagnostics: unknown[] = [];
    const health = new LocalAuditHealthService((value) => {
      diagnostics.push(value);
    });
    const error = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const dispatch = vi.fn((): Promise<void> => {
      const failure = new Error(
        'Synthetic private diagnostic must not escape.',
      );
      if (mode === 'sync') throw failure;
      return Promise.reject(failure);
    });
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    vi.setSystemTime(new Date('2030-01-01T23:59:59.000Z'));
    const scheduler = new AuditRetentionScheduler(
      [
        {
          store: 'main',
          resource: {
            dispatch,
            stopAccepting: () => undefined,
            dispose: async () => undefined,
          },
        },
      ],
      health,
    );
    try {
      scheduler.start();
      await vi.advanceTimersByTimeAsync(1000);
      await scheduler.dispose();
      expect(dispatch).toHaveBeenCalledTimes(1);
      expect(health.get().coverage).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            producer: 'audit.retention',
            store: 'main',
            lastError: expect.objectContaining({ code: 'AUDIT_NOT_READY' }),
          }),
        ]),
      );
      expect(JSON.stringify(diagnostics)).not.toContain('Synthetic private');
      expect(error).not.toHaveBeenCalled();
    } finally {
      await scheduler.dispose();
      vi.useRealTimers();
      error.mockRestore();
    }
  });
});
