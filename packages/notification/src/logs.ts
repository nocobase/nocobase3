import type {
  NotificationAttemptRecord,
  NotificationDeliveryRecord,
  NotificationLogRecord,
  NotificationStore,
} from "./store.js";

export interface NotificationLogDetails {
  readonly log: NotificationLogRecord;
  readonly deliveries: readonly {
    readonly delivery: NotificationDeliveryRecord;
    readonly attempts: readonly NotificationAttemptRecord[];
  }[];
}

export class NotificationLogs {
  constructor(private readonly store: NotificationStore) {}

  list(limit?: number): Promise<readonly NotificationLogRecord[]> {
    return this.store.listLogs(limit);
  }

  async listDetails(
    limit?: number,
  ): Promise<readonly NotificationLogDetails[]> {
    const records = await this.store.listLogs(limit);
    const details = await Promise.all(
      records.map((record) => this.get(record.id)),
    );
    return details.filter(
      (item): item is NotificationLogDetails => item !== undefined,
    );
  }

  async get(id: string): Promise<NotificationLogDetails | undefined> {
    const log = await this.store.getLog(id);
    if (!log) return undefined;
    const deliveryRecords = await this.store.listDeliveries(id);
    const deliveries = await Promise.all(
      deliveryRecords.map(
        async (
          delivery,
        ): Promise<NotificationLogDetails["deliveries"][number]> => ({
          delivery,
          attempts: await this.store.listAttempts(delivery.id),
        }),
      ),
    );
    return { log, deliveries };
  }
}
