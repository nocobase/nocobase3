import type { NotificationStore } from './domain.js';

export interface ReconcileNotificationDeliveriesOptions {
  readonly store: NotificationStore;
  readonly dispatchDelivery: (deliveryId: string) => Promise<void>;
  readonly now?: () => Date;
  readonly batchSize?: number;
}

export interface NotificationReconcileResult {
  readonly recoveredQueued: number;
  readonly recoveredUnknown: number;
  readonly dispatched: number;
  readonly dispatchFailures: number;
}

export async function reconcileNotificationDeliveries(
  options: ReconcileNotificationDeliveriesOptions,
): Promise<NotificationReconcileResult> {
  const now = options.now ? options.now().toISOString() : await options.store.now();
  const batchSize = options.batchSize ?? 100;
  const recovered = await options.store.recoverExpiredDeliveries(now);
  const due = await options.store.listDueDeliveries({ now, limit: batchSize });
  let dispatched = 0;
  let dispatchFailures = 0;
  for (const delivery of due) {
    try {
      await options.dispatchDelivery(delivery.id);
      dispatched += 1;
    } catch {
      dispatchFailures += 1;
    }
  }
  return {
    recoveredQueued: recovered.filter((delivery) => delivery.status === 'queued').length,
    recoveredUnknown: recovered.filter(
      (delivery) => delivery.status === 'submission_unknown',
    ).length,
    dispatched,
    dispatchFailures,
  };
}
