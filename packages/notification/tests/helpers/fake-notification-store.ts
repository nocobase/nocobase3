import type {
  NotificationAttemptRecord,
  NotificationDeliveryRecord,
  NotificationDeliveryStatus,
  NotificationErrorRecord,
  NotificationLogBundle,
  NotificationLogRecord,
  NotificationLogStatus,
  NotificationStore,
} from '../../src/store.js';

export class FakeNotificationStore implements NotificationStore {
  private readonly logs = new Map<string, NotificationLogRecord>();
  private readonly deliveries = new Map<string, NotificationDeliveryRecord>();
  private readonly attempts = new Map<string, NotificationAttemptRecord[]>();

  async now(): Promise<string> {
    return new Date().toISOString();
  }

  async create(bundle: NotificationLogBundle): Promise<void> {
    this.logs.set(bundle.log.id, bundle.log);
    for (const delivery of bundle.deliveries) {
      this.deliveries.set(delivery.id, delivery);
    }
  }

  async getLog(id: string): Promise<NotificationLogRecord | undefined> {
    return this.logs.get(id);
  }

  async listLogs(
    limit: number = 100,
  ): Promise<readonly NotificationLogRecord[]> {
    return [...this.logs.values()]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, limit);
  }

  async getDelivery(
    id: string,
  ): Promise<NotificationDeliveryRecord | undefined> {
    return this.deliveries.get(id);
  }

  async listDeliveries(
    notificationId: string,
  ): Promise<readonly NotificationDeliveryRecord[]> {
    return [...this.deliveries.values()].filter(
      (delivery) => delivery.notificationId === notificationId,
    );
  }

  async listPending(
    limit: number = 100,
  ): Promise<readonly NotificationDeliveryRecord[]> {
    return [...this.deliveries.values()]
      .filter((delivery) => delivery.status === 'pending')
      .slice(0, limit);
  }

  async listAttempts(
    deliveryId: string,
  ): Promise<readonly NotificationAttemptRecord[]> {
    return this.attempts.get(deliveryId) ?? [];
  }

  async claimDelivery(
    id: string,
    leaseToken: string,
    leaseExpiresAt: string,
  ): Promise<NotificationDeliveryRecord | undefined> {
    const delivery = this.deliveries.get(id);
    if (!delivery || delivery.status !== 'pending') return undefined;
    const claimed: NotificationDeliveryRecord = {
      ...delivery,
      status: 'sending',
      leaseToken,
      leaseExpiresAt,
      updatedAt: await this.now(),
      version: delivery.version + 1,
    };
    this.deliveries.set(id, claimed);
    await this.refreshLog(claimed.notificationId);
    return claimed;
  }

  async startAttempt(
    delivery: NotificationDeliveryRecord,
    attempt: NotificationAttemptRecord,
  ): Promise<NotificationDeliveryRecord | undefined> {
    const current = this.deliveries.get(delivery.id);
    if (
      !current ||
      current.status !== 'sending' ||
      current.version !== delivery.version
    ) {
      return undefined;
    }
    this.attempts.set(delivery.id, [
      ...(this.attempts.get(delivery.id) ?? []),
      attempt,
    ]);
    const next: NotificationDeliveryRecord = {
      ...current,
      providerCursor: delivery.providerCursor,
      attemptCount: attempt.sequence,
      updatedAt: await this.now(),
      version: current.version + 1,
    };
    this.deliveries.set(next.id, next);
    return next;
  }

  async finishAttempt(attempt: NotificationAttemptRecord): Promise<void> {
    const attempts = this.attempts.get(attempt.deliveryId) ?? [];
    this.attempts.set(
      attempt.deliveryId,
      attempts.map((current) =>
        current.id === attempt.id ? attempt : current,
      ),
    );
  }

  async finishDelivery(
    delivery: NotificationDeliveryRecord,
    status: Exclude<NotificationDeliveryStatus, 'pending' | 'sending'>,
    error?: NotificationErrorRecord,
  ): Promise<NotificationDeliveryRecord | undefined> {
    const current = this.deliveries.get(delivery.id);
    if (
      !current ||
      current.status !== 'sending' ||
      current.version !== delivery.version
    ) {
      return undefined;
    }
    const finished: NotificationDeliveryRecord = {
      ...current,
      status,
      lastError: error,
      leaseToken: undefined,
      leaseExpiresAt: undefined,
      updatedAt: await this.now(),
      version: current.version + 1,
    };
    this.deliveries.set(finished.id, finished);
    await this.refreshLog(finished.notificationId);
    return finished;
  }

  async recoverExpired(now: string): Promise<number> {
    let recovered = 0;
    for (const delivery of this.deliveries.values()) {
      if (
        delivery.status !== 'sending' ||
        !delivery.leaseExpiresAt ||
        delivery.leaseExpiresAt > now
      ) {
        continue;
      }
      const next: NotificationDeliveryRecord = {
        ...delivery,
        status: 'unknown',
        leaseToken: undefined,
        leaseExpiresAt: undefined,
        lastError: {
          code: 'LEASE_EXPIRED',
          message: 'Provider result is unknown after worker interruption.',
        },
        updatedAt: now,
        version: delivery.version + 1,
      };
      this.deliveries.set(next.id, next);
      await this.refreshLog(next.notificationId);
      recovered += 1;
    }
    return recovered;
  }

  private async refreshLog(notificationId: string): Promise<void> {
    const log = this.logs.get(notificationId);
    if (!log) return;
    this.logs.set(notificationId, {
      ...log,
      status: summarize(await this.listDeliveries(notificationId)),
      updatedAt: await this.now(),
    });
  }
}

function summarize(
  deliveries: readonly NotificationDeliveryRecord[],
): NotificationLogStatus {
  if (deliveries.some((delivery) => delivery.status === 'unknown'))
    return 'unknown';
  if (deliveries.every((delivery) => delivery.status === 'pending'))
    return 'pending';
  if (
    deliveries.some(
      (delivery) =>
        delivery.status === 'pending' || delivery.status === 'sending',
    )
  ) {
    return 'processing';
  }
  if (deliveries.every((delivery) => delivery.status === 'sent'))
    return 'completed';
  if (deliveries.every((delivery) => delivery.status === 'failed'))
    return 'failed';
  return 'partial';
}
