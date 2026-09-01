import type { Logger } from '@nocobase/logging';

export interface NotificationReconcileJobOptions {
  readonly intervalMs: number;
  readonly logger: Logger;
  readonly execute: () => Promise<void>;
}

/** Owns the lifecycle of periodic notification reconciliation. */
export class NotificationReconcileJob {
  private timer?: ReturnType<typeof setInterval>;

  constructor(private readonly options: NotificationReconcileJobOptions) {}

  public start(): void {
    if (this.timer) return;
    // TODO(queue): Replace this process-local timer with Job.schedule().every()
    // once NocoBase exposes a stable, adapter-independent schedule lifecycle.
    this.timer = setInterval(
      (): void => this.execute(),
      this.options.intervalMs,
    );
    this.timer.unref?.();
  }

  public stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = undefined;
  }

  private execute(): void {
    void this.options.execute().catch((error: unknown) => {
      this.options.logger.error(
        { event: 'notification.reconcile_failed', err: error },
        'Notification reconciliation failed.',
      );
    });
  }
}
