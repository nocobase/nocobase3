export type NotificationChannel = 'in-app' | 'email';
export type NotificationStatus = 'queued' | 'sending' | 'accepted' | 'delivered' | 'failed' | 'submission_unknown';

export interface NotificationRecord {
  id: string;
  sourceType: string;
  sourceReferenceId?: string;
  principalService: string;
  triggeredAt: string;
  messageMode: 'direct' | 'template';
  templateName?: string;
  templateVersion?: string;
  summaryStatus: NotificationStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface DeliveryRecord {
  id: string;
  notificationId: string;
  channel: NotificationChannel;
  recipientKey: string;
  recipientSnapshot: Record<string, unknown>;
  recipientSchemaVersion: number;
  contentSnapshot: Record<string, unknown>;
  contentSchemaVersion: number;
  providerChainSnapshot: readonly string[];
  providerChainSchemaVersion: number;
  providerCursor: number;
  currentAttempt: number;
  status: NotificationStatus;
  statusChangedAt: string;
  nextRunAt?: string;
  leaseToken?: string;
  leaseOwner?: string;
  leaseExpiresAt?: string;
  version: number;
  lastAttemptId?: string;
  lastError?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface DeliveryStatusEventRecord {
  id: string;
  deliveryId: string;
  sequence: number;
  fromStatus?: NotificationStatus;
  toStatus: NotificationStatus;
  attemptId?: string;
  reason?: string;
  actor?: string;
  occurredAt: string;
  metadata?: Record<string, unknown>;
}

export interface UserNotificationItemRecord {
  id: string;
  deliveryId: string;
  notificationId: string;
  userId: string;
  channel: NotificationChannel;
  availableAt?: string;
  readAt?: string;
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface NotificationStore {
  createNotification(record: NotificationRecord): Promise<void>;
  getNotification(id: string): Promise<NotificationRecord | undefined>;
  createDelivery(record: DeliveryRecord): Promise<void>;
  getDelivery(id: string): Promise<DeliveryRecord | undefined>;
  transitionDelivery(input: DeliveryTransition): Promise<DeliveryRecord | undefined>;
}

export interface DeliveryTransition {
  deliveryId: string;
  expectedVersion: number;
  fromStatus: NotificationStatus;
  toStatus: NotificationStatus;
  statusChangedAt: string;
  leaseToken?: string;
  lastError?: Record<string, unknown>;
}

export function createMemoryNotificationStore(): NotificationStore {
  const notifications = new Map<string, NotificationRecord>();
  const deliveries = new Map<string, DeliveryRecord>();

  return {
    async createNotification(record): Promise<void> {
      if (notifications.has(record.id)) {
        throw new Error(`Notification "${record.id}" already exists.`);
      }
      notifications.set(record.id, structuredClone(record));
    },
    async getNotification(id): Promise<NotificationRecord | undefined> {
      const record = notifications.get(id);
      return record ? structuredClone(record) : undefined;
    },
    async createDelivery(record): Promise<void> {
      if (deliveries.has(record.id)) {
        throw new Error(`Delivery "${record.id}" already exists.`);
      }
      deliveries.set(record.id, structuredClone(record));
    },
    async getDelivery(id): Promise<DeliveryRecord | undefined> {
      const record = deliveries.get(id);
      return record ? structuredClone(record) : undefined;
    },
    async transitionDelivery(input): Promise<DeliveryRecord | undefined> {
      const current = deliveries.get(input.deliveryId);
      if (
        !current ||
        current.version !== input.expectedVersion ||
        current.status !== input.fromStatus ||
        (input.leaseToken !== undefined && current.leaseToken !== input.leaseToken)
      ) {
        return undefined;
      }

      const next: DeliveryRecord = {
        ...current,
        status: input.toStatus,
        statusChangedAt: input.statusChangedAt,
        lastError: input.lastError,
        version: current.version + 1,
        updatedAt: input.statusChangedAt,
      };
      deliveries.set(next.id, next);
      return structuredClone(next);
    },
  };
}

export function createDatabaseNotificationStore(database: DatabaseManager): NotificationStore {
  return {
    async createNotification(record): Promise<void> {
      await database.query().insertInto<NotificationRow>('notifications').values(toNotificationRow(record)).execute();
    },
    async getNotification(id): Promise<NotificationRecord | undefined> {
      const row = await database
        .query()
        .selectFrom<NotificationRow>('notifications')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst<NotificationRow>();
      return row ? fromNotificationRow(row) : undefined;
    },
    async createDelivery(record): Promise<void> {
      await database.query().insertInto<DeliveryRow>('notificationDeliveries').values(toDeliveryRow(record)).execute();
    },
    async getDelivery(id): Promise<DeliveryRecord | undefined> {
      const row = await database
        .query()
        .selectFrom<DeliveryRow>('notificationDeliveries')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst<DeliveryRow>();
      return row ? fromDeliveryRow(row) : undefined;
    },
    async transitionDelivery(input): Promise<DeliveryRecord | undefined> {
      return database.transaction(async (connection) => {
        let update = connection.query
          .updateTable<DeliveryRow>('notificationDeliveries')
          .set({
            status: input.toStatus,
            statusChangedAt: input.statusChangedAt,
            lastError: input.lastError,
            version: input.expectedVersion + 1,
            updatedAt: input.statusChangedAt,
          })
          .where('id', '=', input.deliveryId)
          .where('version', '=', input.expectedVersion)
          .where('status', '=', input.fromStatus);
        if (input.leaseToken !== undefined) {
          update = update.where('leaseToken', '=', input.leaseToken);
        }
        const result = await update.execute();
        if (result.updatedCount !== 1) {
          return undefined;
        }
        const row = await connection.query
          .selectFrom<DeliveryRow>('notificationDeliveries')
          .selectAll()
          .where('id', '=', input.deliveryId)
          .executeTakeFirst<DeliveryRow>();
        return row ? fromDeliveryRow(row) : undefined;
      });
    },
  };
}

interface NotificationRow extends Row {
  id: string;
  sourceType: string;
  sourceReferenceId?: string;
  principalService: string;
  triggeredAt: string;
  messageMode: NotificationRecord['messageMode'];
  templateName?: string;
  templateVersion?: string;
  summaryStatus: NotificationStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
}

interface DeliveryRow extends Row {
  id: string;
  notificationId: string;
  channel: NotificationChannel;
  recipientKey: string;
  recipientSnapshot: unknown;
  recipientSchemaVersion: number;
  contentSnapshot: unknown;
  contentSchemaVersion: number;
  providerChainSnapshot: unknown;
  providerChainSchemaVersion: number;
  providerCursor: number;
  currentAttempt: number;
  status: NotificationStatus;
  statusChangedAt: string;
  nextRunAt?: string;
  leaseToken?: string;
  leaseOwner?: string;
  leaseExpiresAt?: string;
  version: number;
  lastAttemptId?: string;
  lastError?: unknown;
  createdAt: string;
  updatedAt: string;
}

function toNotificationRow(record: NotificationRecord): NotificationRow {
  return {
    id: record.id,
    sourceType: record.sourceType,
    sourceReferenceId: record.sourceReferenceId,
    principalService: record.principalService,
    triggeredAt: record.triggeredAt,
    messageMode: record.messageMode,
    templateName: record.templateName,
    templateVersion: record.templateVersion,
    summaryStatus: record.summaryStatus,
    version: record.version,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function fromNotificationRow(row: NotificationRow): NotificationRecord {
  return { ...row };
}

function toDeliveryRow(record: DeliveryRecord): DeliveryRow {
  return {
    ...record,
    recipientSnapshot: JSON.stringify(record.recipientSnapshot),
    contentSnapshot: JSON.stringify(record.contentSnapshot),
    providerChainSnapshot: JSON.stringify(record.providerChainSnapshot),
    lastError: record.lastError === undefined ? undefined : JSON.stringify(record.lastError),
  };
}

function fromDeliveryRow(row: DeliveryRow): DeliveryRecord {
  return {
    ...row,
    recipientSnapshot: parseJsonObject(row.recipientSnapshot),
    contentSnapshot: parseJsonObject(row.contentSnapshot),
    providerChainSnapshot: parseJsonArray(row.providerChainSnapshot),
    lastError: row.lastError === undefined ? undefined : parseJsonObject(row.lastError),
  };
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') {
    return JSON.parse(value) as Record<string, unknown>;
  }
  return (value ?? {}) as Record<string, unknown>;
}

function parseJsonArray(value: unknown): readonly string[] {
  if (typeof value === 'string') {
    return JSON.parse(value) as readonly string[];
  }
  return (value ?? []) as readonly string[];
}
import type { DatabaseManager, Row } from '@nocobase/database';
