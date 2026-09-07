import { createCronJobManager, type CronJobManager } from '@nocobase/cron';
import type { AuditRetentionQueueResources } from '../queue/retention.js';
import type { LocalAuditHealthService } from '../health-service.js';

/** App-owned scheduling only; deletion and retry contracts remain in Queue. */
export class AuditRetentionScheduler {
  private readonly cron: CronJobManager = createCronJobManager();
  private readonly pending: Set<Promise<void>> = new Set();
  private closing = false;
  private disposed?: Promise<void>;

  constructor(
    entries: readonly {
      store: string;
      resource: AuditRetentionQueueResources;
    }[],
    health: LocalAuditHealthService,
  ) {
    for (const { store, resource } of entries) {
      this.cron.addJob({
        cronTime: '0 0 * * *',
        timeZone: 'UTC',
        waitForCompletion: true,
        unrefTimeout: true,
        onTick: (): Promise<void> => {
          if (this.closing) return Promise.resolve();
          const task = Promise.resolve()
            .then(() => resource.dispatch())
            .catch(() => {
              health.failure('AUDIT_NOT_READY', 'audit.retention', store);
            });
          this.pending.add(task);
          void task.then(() => this.pending.delete(task));
          return task;
        },
      });
    }
  }
  start(): void {
    this.cron.start();
  }
  dispose(): Promise<void> {
    this.closing = true;
    this.cron.close();
    this.disposed ??= Promise.allSettled([...this.pending]).then(
      () => undefined,
    );
    return this.disposed;
  }
}
