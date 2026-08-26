import type {
  NotificationAttemptRecord,
  NotificationDeliveryRecord,
  NotificationDeliveryStatus,
  NotificationErrorRecord,
  NotificationLogBundle,
  NotificationLogRecord,
  NotificationLogStatus,
  NotificationStore,
} from '../../server/store.js';

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
    const log = this.logs.get(id);
    return log ? this.withSummary(log) : undefined;
  }

  async listLogs(
    limit: number = 100,
  ): Promise<readonly NotificationLogRecord[]> {
    const logs = await Promise.all(
      [...this.logs.values()].map((log) => this.withSummary(log)),
    );
    return logs
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

  async listReady(
    now: string,
    limit: number = 100,
  ): Promise<readonly NotificationDeliveryRecord[]> {
    return [...this.deliveries.values()]
      .filter(
        (delivery) =>
          delivery.status === 'pending' ||
          (delivery.status === 'failed' &&
            delivery.nextRunAt !== undefined &&
            delivery.nextRunAt <= now),
      )
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
    const now = await this.now();
    if (
      !delivery ||
      (delivery.status !== 'pending' &&
        !(
          delivery.status === 'failed' &&
          delivery.nextRunAt !== undefined &&
          delivery.nextRunAt <= now
        ))
    )
      return undefined;
    const claimed: NotificationDeliveryRecord = {
      ...delivery,
      status: 'preparing',
      nextRunAt: undefined,
      leaseToken,
      leaseExpiresAt,
      updatedAt: await this.now(),
    };
    this.deliveries.set(id, claimed);
    return claimed;
  }

  async startAttempt(
    delivery: NotificationDeliveryRecord,
    attempt: NotificationAttemptRecord,
    leaseExpiresAt: string,
  ): Promise<NotificationDeliveryRecord | undefined> {
    const current = this.deliveries.get(delivery.id);
    if (
      !current ||
      !['preparing', 'submitting'].includes(current.status) ||
      current.leaseToken !== delivery.leaseToken ||
      current.attemptCount !== delivery.attemptCount
    ) {
      return undefined;
    }
    this.attempts.set(delivery.id, [
      ...(this.attempts.get(delivery.id) ?? []),
      attempt,
    ]);
    const next: NotificationDeliveryRecord = {
      ...current,
      attemptCount: attempt.sequence,
      status: 'submitting',
      leaseExpiresAt,
      updatedAt: await this.now(),
    };
    this.deliveries.set(next.id, next);
    return next;
  }

  private async finishAttempt(
    attempt: NotificationAttemptRecord,
  ): Promise<void> {
    const attempts = this.attempts.get(attempt.deliveryId) ?? [];
    this.attempts.set(
      attempt.deliveryId,
      attempts.map((current) =>
        current.id === attempt.id ? attempt : current,
      ),
    );
  }

  async finishAttemptAndDelivery(
    attempt: NotificationAttemptRecord,
    delivery: NotificationDeliveryRecord,
    status: Extract<
      NotificationDeliveryStatus,
      'accepted' | 'failed' | 'unknown'
    >,
    error?: NotificationErrorRecord,
    nextRunAt?: string,
  ): Promise<NotificationDeliveryRecord | undefined> {
    const current = this.deliveries.get(delivery.id);
    if (
      !current ||
      current.status !== 'submitting' ||
      current.leaseToken !== delivery.leaseToken
    )
      return undefined;
    await this.finishAttempt(attempt);
    const finished: NotificationDeliveryRecord = {
      ...current,
      status,
      lastError: error,
      nextRunAt,
      leaseToken: undefined,
      leaseExpiresAt: undefined,
      updatedAt: await this.now(),
    };
    this.deliveries.set(finished.id, finished);
    return finished;
  }

  async renewLease(
    id: string,
    leaseToken: string,
    leaseExpiresAt: string,
  ): Promise<boolean> {
    const current = this.deliveries.get(id);
    if (
      !current ||
      !['preparing', 'submitting'].includes(current.status) ||
      current.leaseToken !== leaseToken
    )
      return false;
    this.deliveries.set(id, { ...current, leaseExpiresAt });
    return true;
  }

  async finishDelivery(
    delivery: NotificationDeliveryRecord,
    status: Extract<
      NotificationDeliveryStatus,
      'accepted' | 'failed' | 'unknown'
    >,
    error?: NotificationErrorRecord,
  ): Promise<NotificationDeliveryRecord | undefined> {
    const current = this.deliveries.get(delivery.id);
    if (
      !current ||
      !['preparing', 'submitting'].includes(current.status) ||
      current.leaseToken !== delivery.leaseToken
    ) {
      return undefined;
    }
    const finished: NotificationDeliveryRecord = {
      ...current,
      status,
      lastError: error,
      nextRunAt: undefined,
      leaseToken: undefined,
      leaseExpiresAt: undefined,
      updatedAt: await this.now(),
    };
    this.deliveries.set(finished.id, finished);
    return finished;
  }

  async recoverExpired(now: string): Promise<number> {
    let recovered = 0;
    for (const delivery of this.deliveries.values()) {
      if (
        !['preparing', 'submitting'].includes(delivery.status) ||
        !delivery.leaseExpiresAt ||
        delivery.leaseExpiresAt > now
      ) {
        continue;
      }
      const next: NotificationDeliveryRecord = {
        ...delivery,
        status: delivery.status === 'preparing' ? 'pending' : 'unknown',
        leaseToken: undefined,
        leaseExpiresAt: undefined,
        lastError:
          delivery.status === 'preparing'
            ? undefined
            : {
                code: 'LEASE_EXPIRED',
                message:
                  'Provider result is unknown after worker interruption.',
              },
        updatedAt: now,
      };
      this.deliveries.set(next.id, next);
      recovered += 1;
    }
    return recovered;
  }

  private async withSummary(
    log: NotificationLogRecord,
  ): Promise<NotificationLogRecord> {
    const deliveries = await this.listDeliveries(log.id);
    return {
      ...log,
      status: summarize(deliveries),
      updatedAt: deliveries.reduce(
        (latest, delivery) =>
          delivery.updatedAt > latest ? delivery.updatedAt : latest,
        log.updatedAt,
      ),
    };
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
        delivery.status === 'pending' ||
        delivery.status === 'preparing' ||
        delivery.status === 'submitting' ||
        (delivery.status === 'failed' && delivery.nextRunAt !== undefined),
    )
  ) {
    return 'processing';
  }
  if (deliveries.every((delivery) => delivery.status === 'accepted'))
    return 'completed';
  if (deliveries.every((delivery) => delivery.status === 'failed'))
    return 'failed';
  return 'partial';
}
