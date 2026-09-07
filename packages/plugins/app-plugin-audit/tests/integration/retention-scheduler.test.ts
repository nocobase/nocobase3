import { describe, expect, it, vi } from 'vitest';
import { createQueueManager, createSyncQueueConfig } from '@nocobase/queue';
import { createAuditApiFixture } from '../helpers/api-fixture.js';
import { AuditRetentionService } from '../../server/retention-service.js';
import { createAuditRetentionQueueResources } from '../../server/queue/retention.js';
import { AuditRetentionScheduler } from '../../server/providers/retention-scheduler.js';
import { auditRaw } from '../../server/database/sql-client.js';

describe('recurring retention', () => {
  it('runs future UTC rounds without restart, honors null and disabled policy, and cancels on shutdown', async () => {
    const f = await createAuditApiFixture('sqlite');
    const queue = createQueueManager(createSyncQueueConfig(), {
      database: f.f.manager,
      jobFactory: (JobClass) => new JobClass({ database: f.f.manager }),
    });
    const service = new AuditRetentionService({
      connection: f.f.connection,
      store: f.f.store,
      configurationStore: f.f.store,
      settings: f.settings,
      health: f.health,
    });
    const resource = createAuditRetentionQueueResources({
      database: f.f.manager,
      queue,
      binding: f.f.store.binding,
      service,
    });
    const dispatch = vi.spyOn(resource, 'dispatch');
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    vi.setSystemTime(new Date('2030-01-01T23:59:59.000Z'));
    const scheduler = new AuditRetentionScheduler(
      [{ store: 'main', resource }],
      f.health,
    );
    const expired = async (id: string): Promise<void> => {
      await f.append(id);
      await auditRaw(
        f.f.connection,
        'UPDATE "auditEvents" SET "occurredAt" = ? WHERE "id" = ?',
        ['2000-01-01T00:00:00.000Z', id],
      );
    };
    const tick = async (
      milliseconds: number,
      expected: number,
    ): Promise<void> => {
      await vi.advanceTimersByTimeAsync(milliseconds);
      expect(dispatch).toHaveBeenCalledTimes(expected);
      await dispatch.mock.results[expected - 1].value;
    };
    const ids = async (): Promise<string[]> =>
      (
        await f.f.store.query(f.f.scope, { store: 'main', pageSize: 100 })
      ).items.map((event) => event.id);
    try {
      await expired('g20-first-round');
      scheduler.start();
      scheduler.start();
      await tick(1000, 1);
      expect(await ids()).not.toContain('g20-first-round');
      await expired('g20-second-round');
      await tick(86400000, 2);
      expect(await ids()).not.toContain('g20-second-round');
      let policy = await f.settings.get(f.f.scope);
      await f.settings.update(f.f.scope, {
        expectedRevision: policy.revision,
        settings: { ...policy, retentionDays: null },
        confirmRetentionReduction: false,
      });
      await expired('g20-retained');
      await tick(86400000, 3);
      expect(await ids()).toContain('g20-retained');
      expect(service.observe().state).toBe('no-auto-delete');
      policy = await f.settings.get(f.f.scope);
      await f.settings.update(f.f.scope, {
        expectedRevision: policy.revision,
        settings: { ...policy, enabled: false },
        confirmRetentionReduction: false,
      });
      await tick(86400000, 4);
      expect(await ids()).toContain('g20-retained');
      expect(service.observe().state).toBe('disabled');
      await scheduler.dispose();
      await vi.advanceTimersByTimeAsync(86400000 * 2);
      expect(dispatch).toHaveBeenCalledTimes(4);
    } finally {
      await scheduler.dispose();
      vi.useRealTimers();
      dispatch.mockRestore();
      await resource.dispose();
      await queue.close();
      await f.cleanup();
    }
  });
});
