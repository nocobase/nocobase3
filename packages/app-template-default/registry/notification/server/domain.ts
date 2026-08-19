import { randomUUID } from 'node:crypto';

import type { DatabaseConnection, DatabaseManager, QueryAdapter, Row } from '@nocobase/database';

export type NotificationChannel = 'in-app' | 'email';
export type NotificationStatus = 'queued' | 'sending' | 'accepted' | 'delivered' | 'failed' | 'submission_unknown';
export type NotificationSummaryStatus = 'queued' | 'processing' | 'succeeded' | 'partially_succeeded' | 'failed' | 'attention_required';

export class NotificationStoreCompatibilityError extends Error {
  readonly code = 'NOTIFICATION_SCHEMA_VERSION_UNSUPPORTED' as const;

  constructor(readonly snapshot: string, readonly version: number) {
    super(`Unsupported ${snapshot} schema version: ${version}.`);
    this.name = 'NotificationStoreCompatibilityError';
  }
}

export interface NotificationRecord {
  id: string;
  sourceType: string;
  sourceReferenceId?: string;
  principalService: string;
  triggeredAt: string;
  messageMode: 'direct' | 'template';
  templateName?: string;
  templateVersion?: string;
  summaryStatus: NotificationSummaryStatus;
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
  metadataSchemaVersion: number;
}

export interface DeliveryAttemptRecord {
  id: string;
  deliveryId: string;
  attemptSequence: number;
  providerInstance: string;
  providerType: string;
  configRevision?: string;
  status: NotificationStatus;
  startedAt: string;
  invocationStartedAt?: string;
  finishedAt?: string;
  providerMessageId?: string;
  errorPhase?: string;
  errorCategory?: string;
  errorCode?: string;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
  metadataSchemaVersion: number;
  createdAt: string;
  updatedAt: string;
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

export interface NotificationCommandStore {
  createNotificationBundle(input: NotificationBundle): Promise<void>;
  createNotification(record: NotificationRecord): Promise<void>;
  createDelivery(record: DeliveryRecord): Promise<void>;
  transitionDelivery(input: DeliveryTransition): Promise<DeliveryRecord | undefined>;
  createUserNotificationItem(record: UserNotificationItemRecord): Promise<void>;
  updateInboxItem(input: InboxMutation): Promise<UserNotificationItemRecord | undefined>;
  markInboxRead(input: InboxReadAllMutation): Promise<number>;
}

export interface NotificationQueryStore {
  getNotification(id: string): Promise<NotificationRecord | undefined>;
  getDelivery(id: string): Promise<DeliveryRecord | undefined>;
  listDeliveries(input: DeliveryListQuery): Promise<readonly DeliveryRecord[]>;
  countDeliveries(input: Omit<DeliveryListQuery, 'page' | 'pageSize'>): Promise<number>;
  listDeliveryStatusEvents(deliveryId: string): Promise<readonly DeliveryStatusEventRecord[]>;
  listDeliveryAttempts(deliveryId: string): Promise<readonly DeliveryAttemptRecord[]>;
  listUserNotificationItemsByDelivery(deliveryId: string): Promise<readonly UserNotificationItemRecord[]>;
  getInboxItem(itemId: string, userId: string): Promise<UserNotificationItemRecord | undefined>;
  listInbox(input: InboxQuery): Promise<readonly UserNotificationItemRecord[]>;
  countUnread(input: InboxQuery): Promise<number>;
}

export interface NotificationMaintenanceStore {
  listDueDeliveries(input: DueDeliveryQuery): Promise<readonly DeliveryRecord[]>;
  claimDelivery(input: DeliveryClaim): Promise<DeliveryRecord | undefined>;
  recoverExpiredDeliveries(now: string): Promise<readonly DeliveryRecord[]>;
}

export interface NotificationMigrationStore {
  readonly schemaVersion: 1;
}

export interface NotificationClockStore {
  now(): Promise<string>;
}

export interface NotificationStore extends NotificationCommandStore, NotificationQueryStore, NotificationMaintenanceStore, NotificationMigrationStore, NotificationClockStore {
}

export interface NotificationBundle {
  notification: NotificationRecord;
  deliveries: readonly DeliveryRecord[];
  statusEvents?: readonly DeliveryStatusEventRecord[];
  userNotificationItems?: readonly UserNotificationItemRecord[];
}

export interface DueDeliveryQuery {
  now: string;
  limit: number;
}

export interface DeliveryListQuery {
  status?: NotificationStatus;
  channel?: NotificationChannel;
  search?: string;
  page: number;
  pageSize: number;
}

export interface DeliveryClaim {
  deliveryId: string;
  expectedVersion: number;
  leaseToken: string;
  leaseOwner: string;
  leaseExpiresAt: string;
  claimedAt: string;
  attempt?: DeliveryAttemptRecord;
  event?: DeliveryStatusEventRecord;
}

export interface InboxQuery {
  userId: string;
  channel?: NotificationChannel;
  includeDeleted?: boolean;
  unreadOnly?: boolean;
  limit?: number;
  beforeCreatedAt?: string;
  beforeId?: string;
}

export interface InboxMutation {
  itemId: string;
  userId: string;
  action: 'read' | 'unread' | 'delete';
  changedAt: string;
  expectedVersion: number;
}

export interface InboxReadAllMutation {
  userId: string;
  channel?: NotificationChannel;
  changedAt: string;
}

export interface DeliveryTransition {
  deliveryId: string;
  expectedVersion: number;
  fromStatus: NotificationStatus;
  toStatus: NotificationStatus;
  statusChangedAt: string;
  leaseToken?: string;
  lastError?: Record<string, unknown>;
  clearLastError?: boolean;
  event?: DeliveryStatusEventRecord;
  attempt?: DeliveryAttemptRecord;
  nextRunAt?: string;
  clearNextRunAt?: boolean;
  providerCursor?: number;
  currentAttempt?: number;
  clearLease?: boolean;
}

export function createMemoryNotificationStore(): NotificationStore {
  const notifications = new Map<string, NotificationRecord>();
  const deliveries = new Map<string, DeliveryRecord>();
  const userItems = new Map<string, UserNotificationItemRecord>();
  const attempts = new Map<string, DeliveryAttemptRecord>();
  const events = new Map<string, DeliveryStatusEventRecord>();

  const store: NotificationStore = {
    schemaVersion: 1,
    async now(): Promise<string> {
      return new Date().toISOString();
    },
    async createNotificationBundle(input): Promise<void> {
      validateBundleSchemaVersions(input);
      if (notifications.has(input.notification.id) || hasDuplicateIds(input.deliveries) || input.deliveries.some((item) => deliveries.has(item.id))) {
        throw new Error(`Notification bundle "${input.notification.id}" already exists.`);
      }
      const duplicateItem = hasDuplicateIds(input.userNotificationItems ?? []) || input.userNotificationItems?.some((item) => userItems.has(item.id));
      if (duplicateItem) throw new Error('User notification item already exists.');
      if (
        hasDuplicateIds(input.statusEvents ?? []) ||
        hasDuplicateEventSequences(input.statusEvents ?? []) ||
        input.statusEvents?.some((event) =>
          events.has(event.id) || [...events.values()].some((existing) => existing.deliveryId === event.deliveryId && existing.sequence === event.sequence),
        )
      ) {
        throw new Error('Delivery status event already exists.');
      }
      notifications.set(input.notification.id, structuredClone(input.notification));
      for (const delivery of input.deliveries) deliveries.set(delivery.id, structuredClone(delivery));
      for (const item of input.userNotificationItems ?? []) userItems.set(item.id, structuredClone(item));
      for (const event of input.statusEvents ?? []) events.set(event.id, structuredClone(event));
    },
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
    async listDeliveries(input): Promise<readonly DeliveryRecord[]> {
      const search = input.search?.trim().toLowerCase();
      return [...deliveries.values()]
        .filter((delivery) => input.status === undefined || delivery.status === input.status)
        .filter((delivery) => input.channel === undefined || delivery.channel === input.channel)
        .filter((delivery) => !search || delivery.id.toLowerCase().startsWith(search) || delivery.notificationId.toLowerCase().startsWith(search) || recipientSearchMatches(delivery.recipientKey, search))
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || right.id.localeCompare(left.id))
        .slice((input.page - 1) * input.pageSize, input.page * input.pageSize)
        .map((delivery) => structuredClone(delivery));
    },
    async countDeliveries(input): Promise<number> {
      const search = input.search?.trim().toLowerCase();
      return [...deliveries.values()]
        .filter((delivery) => input.status === undefined || delivery.status === input.status)
        .filter((delivery) => input.channel === undefined || delivery.channel === input.channel)
        .filter((delivery) => !search || delivery.id.toLowerCase().startsWith(search) || delivery.notificationId.toLowerCase().startsWith(search) || recipientSearchMatches(delivery.recipientKey, search)).length;
    },
    async transitionDelivery(input): Promise<DeliveryRecord | undefined> {
      validateAttemptAndEventVersions(input.attempt, input.event);
      const current = deliveries.get(input.deliveryId);
      if (
        !current ||
        current.version !== input.expectedVersion ||
        current.status !== input.fromStatus ||
        (input.leaseToken !== undefined && current.leaseToken !== input.leaseToken)
      ) {
        return undefined;
      }
      assertMemoryHistoryAvailable(attempts, events, input.attempt, input.event, true);

      const next: DeliveryRecord = {
        ...current,
        status: input.toStatus,
        statusChangedAt: input.statusChangedAt,
        lastError: input.clearLastError ? undefined : input.lastError ?? current.lastError,
        nextRunAt: input.clearNextRunAt ? undefined : input.nextRunAt ?? current.nextRunAt,
        providerCursor: input.providerCursor ?? current.providerCursor,
        currentAttempt: input.currentAttempt ?? current.currentAttempt,
        leaseToken: input.clearLease ? undefined : current.leaseToken,
        leaseOwner: input.clearLease ? undefined : current.leaseOwner,
        leaseExpiresAt: input.clearLease ? undefined : current.leaseExpiresAt,
        lastAttemptId: input.attempt?.id ?? current.lastAttemptId,
        version: current.version + 1,
        updatedAt: input.statusChangedAt,
      };
      deliveries.set(next.id, next);
      if (input.attempt) attempts.set(input.attempt.id, structuredClone(input.attempt));
      if (input.event) events.set(input.event.id, structuredClone(input.event));
      makeUserItemVisible(userItems, next, input.statusChangedAt);
      recomputeMemoryNotification(notifications, deliveries, next.notificationId, input.statusChangedAt);
      return structuredClone(next);
    },
    async listDeliveryStatusEvents(deliveryId): Promise<readonly DeliveryStatusEventRecord[]> {
      return [...events.values()].filter((event) => event.deliveryId === deliveryId).sort((a, b) => a.sequence - b.sequence).map((event) => structuredClone(event));
    },
    async listDeliveryAttempts(deliveryId): Promise<readonly DeliveryAttemptRecord[]> {
      return [...attempts.values()].filter((attempt) => attempt.deliveryId === deliveryId).sort((a, b) => a.attemptSequence - b.attemptSequence).map((attempt) => structuredClone(attempt));
    },
    async listUserNotificationItemsByDelivery(deliveryId): Promise<readonly UserNotificationItemRecord[]> {
      return [...userItems.values()].filter((item) => item.deliveryId === deliveryId).map((item) => structuredClone(item));
    },
    async listDueDeliveries(input): Promise<readonly DeliveryRecord[]> {
      return [...deliveries.values()]
        .filter((delivery) =>
          delivery.status === 'queued' &&
          (!delivery.nextRunAt || delivery.nextRunAt <= input.now) &&
          (!delivery.leaseExpiresAt || delivery.leaseExpiresAt <= input.now),
        )
        .sort((left, right) => left.nextRunAt?.localeCompare(right.nextRunAt ?? '') ?? 0)
        .slice(0, input.limit)
        .map((delivery) => structuredClone(delivery));
    },
    async claimDelivery(input): Promise<DeliveryRecord | undefined> {
      validateAttemptAndEventVersions(input.attempt, input.event);
      const current = deliveries.get(input.deliveryId);
      if (!current || current.version !== input.expectedVersion || current.status !== 'queued') return undefined;
      assertMemoryHistoryAvailable(attempts, events, input.attempt, input.event, false);
      const next: DeliveryRecord = {
        ...current,
        status: 'sending',
        statusChangedAt: input.claimedAt,
        leaseToken: input.leaseToken,
        leaseOwner: input.leaseOwner,
        leaseExpiresAt: input.leaseExpiresAt,
        version: current.version + 1,
        updatedAt: input.claimedAt,
      };
      deliveries.set(next.id, next);
      if (input.attempt) attempts.set(input.attempt.id, structuredClone(input.attempt));
      if (input.event) events.set(input.event.id, structuredClone(input.event));
      recomputeMemoryNotification(notifications, deliveries, next.notificationId, input.claimedAt);
      return structuredClone(next);
    },
    async recoverExpiredDeliveries(now): Promise<readonly DeliveryRecord[]> {
      const recovered: DeliveryRecord[] = [];
      for (const delivery of deliveries.values()) {
        if (delivery.status !== 'sending' || !delivery.leaseExpiresAt || delivery.leaseExpiresAt > now) continue;
        const attempt = [...attempts.values()].filter((item) => item.deliveryId === delivery.id).sort((a, b) => b.attemptSequence - a.attemptSequence)[0];
        const invoked = attempt?.invocationStartedAt !== undefined;
        const eventsForDelivery = [...events.values()].filter((event) => event.deliveryId === delivery.id);
        const result = await store.transitionDelivery({ deliveryId: delivery.id, expectedVersion: delivery.version, fromStatus: 'sending', toStatus: invoked ? 'submission_unknown' : 'queued', statusChangedAt: now, leaseToken: delivery.leaseToken, clearLease: true, nextRunAt: invoked ? undefined : now,
          lastError: { code: invoked ? 'WORKER_CRASH_AFTER_INVOCATION' : 'WORKER_CRASH_BEFORE_INVOCATION' },
          attempt: attempt ? { ...attempt, status: invoked ? 'submission_unknown' : 'failed', finishedAt: now, errorPhase: invoked ? 'submission' : 'before_invocation', errorCode: invoked ? 'WORKER_CRASH_AFTER_INVOCATION' : 'WORKER_CRASH_BEFORE_INVOCATION', updatedAt: now } : undefined,
          event: { id: randomUUID(), deliveryId: delivery.id, sequence: eventsForDelivery.length + 1, fromStatus: 'sending', toStatus: invoked ? 'submission_unknown' : 'queued', occurredAt: now, reason: 'lease_expired', metadataSchemaVersion: 1 }, });
        if (result) recovered.push(result);
      }
      return recovered;
    },
    async createUserNotificationItem(record): Promise<void> {
      if (userItems.has(record.id)) throw new Error(`User notification item "${record.id}" already exists.`);
      userItems.set(record.id, structuredClone(record));
    },
    async listInbox(input): Promise<readonly UserNotificationItemRecord[]> {
      return [...userItems.values()]
        .filter((item) => item.userId === input.userId)
        .filter((item) => item.availableAt !== undefined)
        .filter((item) => input.channel === undefined || item.channel === input.channel)
        .filter((item) => input.includeDeleted || item.deletedAt === undefined)
        .filter((item) => !input.unreadOnly || item.readAt === undefined)
        .filter((item) =>
          !input.beforeCreatedAt ||
          item.createdAt < input.beforeCreatedAt ||
          (item.createdAt === input.beforeCreatedAt && input.beforeId !== undefined && item.id < input.beforeId),
        )
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id))
        .slice(0, input.limit ?? 50)
        .map((item) => structuredClone(item));
    },
    async getInboxItem(itemId, userId): Promise<UserNotificationItemRecord | undefined> {
      const item = userItems.get(itemId);
      return item && item.userId === userId && item.availableAt !== undefined && item.deletedAt === undefined
        ? structuredClone(item)
        : undefined;
    },
    async countUnread(input): Promise<number> {
      return (await this.listInbox({ ...input, unreadOnly: true, limit: Number.MAX_SAFE_INTEGER })).length;
    },
    async updateInboxItem(input): Promise<UserNotificationItemRecord | undefined> {
      const current = userItems.get(input.itemId);
      if (!current || current.userId !== input.userId || (input.expectedVersion !== undefined && current.version !== input.expectedVersion)) {
        return undefined;
      }
      if ((input.action === 'read' && current.readAt) || (input.action === 'unread' && !current.readAt) || (input.action === 'delete' && current.deletedAt)) {
        return structuredClone(current);
      }
      const next: UserNotificationItemRecord = {
        ...current,
        readAt: input.action === 'read' ? input.changedAt : input.action === 'unread' ? undefined : current.readAt,
        deletedAt: input.action === 'delete' ? input.changedAt : current.deletedAt,
        version: current.version + 1,
        updatedAt: input.changedAt,
      };
      userItems.set(next.id, next);
      return structuredClone(next);
    },
    async markInboxRead(input): Promise<number> {
      let updated = 0;
      for (const [id, current] of userItems) {
        if (
          current.userId !== input.userId ||
          current.availableAt === undefined ||
          current.deletedAt !== undefined ||
          current.readAt !== undefined ||
          current.createdAt > input.changedAt ||
          (input.channel !== undefined && current.channel !== input.channel)
        ) {
          continue;
        }
        userItems.set(id, {
          ...current,
          readAt: input.changedAt,
          updatedAt: input.changedAt,
          version: current.version + 1,
        });
        updated += 1;
      }
      return updated;
    },
  };
  return store;
}

export function createDatabaseNotificationStore(database: DatabaseManager): NotificationStore {
  const store: NotificationStore = {
    schemaVersion: 1,
    async now(): Promise<string> {
      return databaseCurrentTime(database.connection());
    },
    async createNotificationBundle(input): Promise<void> {
      validateBundleSchemaVersions(input);
      await database.transaction(async (connection) => {
        await connection.query.insertInto<NotificationRow>('notifications').values(toNotificationRow(input.notification)).execute();
        if (input.deliveries.length) {
          await connection.query.insertInto<DeliveryRow>('notificationDeliveries').values(input.deliveries.map(toDeliveryRow)).execute();
        }
        if (input.userNotificationItems?.length) {
          await connection.query.insertInto<UserNotificationItemRow>('userNotificationItems').values(input.userNotificationItems.map(toUserNotificationItemRow)).execute();
        }
        if (input.statusEvents?.length) {
          await connection.query.insertInto<DeliveryStatusEventRow>('notificationDeliveryStatusEvents').values(input.statusEvents.map(toDeliveryStatusEventRow)).execute();
        }
      });
    },
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
    async listDeliveries(input): Promise<readonly DeliveryRecord[]> {
      let query = database.query().selectFrom<DeliveryRow>('notificationDeliveries').selectAll();
      if (input.status !== undefined) query = query.where('status', '=', input.status);
      if (input.channel !== undefined) query = query.where('channel', '=', input.channel);
      if (input.search?.trim()) {
        const search = input.search.trim().toLowerCase();
        const pattern = `${search}%`;
        query = query.where(({ eb, or }) => or([eb('id', 'like', pattern), eb('notificationId', 'like', pattern), eb('recipientKey', 'like', pattern), eb('recipientKey', 'like', `user:${pattern}`), eb('recipientKey', 'like', `email:${pattern}`)]));
      }
      const rows = await query.orderBy('updatedAt', 'desc').orderBy('id', 'desc').offset((input.page - 1) * input.pageSize).limit(input.pageSize).execute<DeliveryRow>();
      return rows.map(fromDeliveryRow);
    },
    async countDeliveries(input): Promise<number> {
      let query = database.query().selectFrom<DeliveryRow>('notificationDeliveries').select((eb) => [eb.fn.countAll<number>().as('total')]);
      if (input.status !== undefined) query = query.where('status', '=', input.status);
      if (input.channel !== undefined) query = query.where('channel', '=', input.channel);
      if (input.search?.trim()) {
        const search = input.search.trim().toLowerCase();
        const pattern = `${search}%`;
        query = query.where(({ eb, or }) => or([eb('id', 'like', pattern), eb('notificationId', 'like', pattern), eb('recipientKey', 'like', pattern), eb('recipientKey', 'like', `user:${pattern}`), eb('recipientKey', 'like', `email:${pattern}`)]));
      }
      const row = await query.executeTakeFirst<{ total: number | string }>();
      return Number(row?.total ?? 0);
    },
    async transitionDelivery(input): Promise<DeliveryRecord | undefined> {
      validateAttemptAndEventVersions(input.attempt, input.event);
      return database.transaction(async (connection) => {
        let update = connection.query
          .updateTable<DeliveryRow>('notificationDeliveries')
          .set({
            status: input.toStatus,
            statusChangedAt: input.statusChangedAt,
            lastError: input.clearLastError ? null : input.lastError === undefined ? undefined : JSON.stringify(input.lastError),
            nextRunAt: input.clearNextRunAt ? null : input.nextRunAt,
            providerCursor: input.providerCursor,
            currentAttempt: input.currentAttempt,
            leaseToken: input.clearLease ? null : undefined,
            leaseOwner: input.clearLease ? null : undefined,
            leaseExpiresAt: input.clearLease ? null : undefined,
            lastAttemptId: input.attempt?.id,
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
        if (input.attempt) {
          const attempt = toDeliveryAttemptRow(input.attempt);
          const updated = await connection.query.updateTable<DeliveryAttemptRow>('notificationDeliveryAttempts').set(attempt).where('id', '=', attempt.id).execute();
          if (updated.updatedCount !== 1) await connection.query.insertInto<DeliveryAttemptRow>('notificationDeliveryAttempts').values(attempt).execute();
        }
        if (input.event) {
          await connection.query.insertInto<DeliveryStatusEventRow>('notificationDeliveryStatusEvents').values(toDeliveryStatusEventRow(input.event)).execute();
        }
        if (input.toStatus === 'delivered' || input.toStatus === 'accepted') {
          await connection.query.updateTable<UserNotificationItemRow>('userNotificationItems').set({ availableAt: input.statusChangedAt, updatedAt: input.statusChangedAt })
            .where('deliveryId', '=', input.deliveryId).where('availableAt', 'is', null).execute();
        }
        const row = await connection.query
          .selectFrom<DeliveryRow>('notificationDeliveries')
          .selectAll()
          .where('id', '=', input.deliveryId)
          .executeTakeFirst<DeliveryRow>();
        if (!row) return undefined;
        await recomputeDatabaseNotification(connection.query, row.notificationId, input.statusChangedAt);
        return fromDeliveryRow(row);
      });
    },
    async listDeliveryStatusEvents(deliveryId): Promise<readonly DeliveryStatusEventRecord[]> {
      const rows = await database.query().selectFrom<DeliveryStatusEventRow>('notificationDeliveryStatusEvents').selectAll().where('deliveryId', '=', deliveryId).orderBy('sequence', 'asc').execute<DeliveryStatusEventRow>();
      return rows.map(fromDeliveryStatusEventRow);
    },
    async listDeliveryAttempts(deliveryId): Promise<readonly DeliveryAttemptRecord[]> {
      const rows = await database.query().selectFrom<DeliveryAttemptRow>('notificationDeliveryAttempts').selectAll().where('deliveryId', '=', deliveryId).orderBy('attemptSequence', 'asc').execute<DeliveryAttemptRow>();
      return rows.map(fromDeliveryAttemptRow);
    },
    async listUserNotificationItemsByDelivery(deliveryId): Promise<readonly UserNotificationItemRecord[]> {
      const rows = await database.query().selectFrom<UserNotificationItemRow>('userNotificationItems').selectAll().where('deliveryId', '=', deliveryId).execute<UserNotificationItemRow>();
      return rows.map(fromUserNotificationItemRow);
    },
    async listDueDeliveries(input): Promise<readonly DeliveryRecord[]> {
      const rows = await database.query().selectFrom<DeliveryRow>('notificationDeliveries').selectAll()
        .where('status', '=', 'queued')
        .where(({ eb, or }) => or([eb('nextRunAt', 'is', null), eb('nextRunAt', '<=', input.now)]))
        .where(({ eb, or }) => or([eb('leaseExpiresAt', 'is', null), eb('leaseExpiresAt', '<=', input.now)]))
        .orderBy('nextRunAt', 'asc').limit(input.limit).execute<DeliveryRow>();
      return rows.map(fromDeliveryRow);
    },
    async claimDelivery(input): Promise<DeliveryRecord | undefined> {
      validateAttemptAndEventVersions(input.attempt, input.event);
      return database.transaction(async (connection) => {
        const result = await connection.query.updateTable<DeliveryRow>('notificationDeliveries').set({
          status: 'sending', statusChangedAt: input.claimedAt, leaseToken: input.leaseToken,
          leaseOwner: input.leaseOwner, leaseExpiresAt: input.leaseExpiresAt, version: input.expectedVersion + 1,
          updatedAt: input.claimedAt,
        }).where('id', '=', input.deliveryId).where('version', '=', input.expectedVersion).where('status', '=', 'queued').execute();
        if (result.updatedCount !== 1) return undefined;
        if (input.attempt) await connection.query.insertInto<DeliveryAttemptRow>('notificationDeliveryAttempts').values(toDeliveryAttemptRow(input.attempt)).execute();
        if (input.event) await connection.query.insertInto<DeliveryStatusEventRow>('notificationDeliveryStatusEvents').values(toDeliveryStatusEventRow(input.event)).execute();
        const row = await connection.query.selectFrom<DeliveryRow>('notificationDeliveries').selectAll().where('id', '=', input.deliveryId).executeTakeFirst<DeliveryRow>();
        if (!row) return undefined;
        await recomputeDatabaseNotification(connection.query, row.notificationId, input.claimedAt);
        return fromDeliveryRow(row);
      });
    },
    async recoverExpiredDeliveries(now): Promise<readonly DeliveryRecord[]> {
      const rows = await database.query().selectFrom<DeliveryRow>('notificationDeliveries').selectAll().where('status', '=', 'sending').where('leaseExpiresAt', '<=', now).execute<DeliveryRow>();
      const recovered: DeliveryRecord[] = [];
      for (const row of rows) {
        const delivery = fromDeliveryRow(row);
        const attemptsForDelivery = await store.listDeliveryAttempts(delivery.id);
        const attempt = attemptsForDelivery.at(-1);
        const invoked = attempt?.invocationStartedAt !== undefined;
        const eventsForDelivery = await store.listDeliveryStatusEvents(delivery.id);
        const result = await store.transitionDelivery({ deliveryId: delivery.id, expectedVersion: delivery.version, fromStatus: 'sending', toStatus: invoked ? 'submission_unknown' : 'queued', statusChangedAt: now, leaseToken: delivery.leaseToken, clearLease: true, nextRunAt: invoked ? undefined : now,
          lastError: { code: invoked ? 'WORKER_CRASH_AFTER_INVOCATION' : 'WORKER_CRASH_BEFORE_INVOCATION' },
          attempt: attempt ? { ...attempt, status: invoked ? 'submission_unknown' : 'failed', finishedAt: now, errorPhase: invoked ? 'submission' : 'before_invocation', errorCode: invoked ? 'WORKER_CRASH_AFTER_INVOCATION' : 'WORKER_CRASH_BEFORE_INVOCATION', updatedAt: now } : undefined,
          event: { id: randomUUID(), deliveryId: delivery.id, sequence: eventsForDelivery.length + 1, fromStatus: 'sending', toStatus: invoked ? 'submission_unknown' : 'queued', occurredAt: now, reason: 'lease_expired', metadataSchemaVersion: 1 }, });
        if (result) recovered.push(result);
      }
      return recovered;
    },
    async createUserNotificationItem(record): Promise<void> {
      await database.query().insertInto<UserNotificationItemRow>('userNotificationItems').values(toUserNotificationItemRow(record)).execute();
    },
    async listInbox(input): Promise<readonly UserNotificationItemRecord[]> {
      let query = database.query().selectFrom<UserNotificationItemRow>('userNotificationItems').selectAll().where('userId', '=', input.userId);
      if (input.channel !== undefined) query = query.where('channel', '=', input.channel);
      query = query.where('availableAt', 'is not', null);
      if (!input.includeDeleted) query = query.where('deletedAt', 'is', null);
      if (input.unreadOnly) query = query.where('readAt', 'is', null);
      if (input.beforeCreatedAt) {
        query = input.beforeId
          ? query.where(({ and, eb, or }) =>
              or([
                eb('createdAt', '<', input.beforeCreatedAt!),
                and([eb('createdAt', '=', input.beforeCreatedAt!), eb('id', '<', input.beforeId!)]),
              ]),
            )
          : query.where('createdAt', '<', input.beforeCreatedAt);
      }
      const rows = await query
        .orderBy('createdAt', 'desc')
        .orderBy('id', 'desc')
        .limit(input.limit ?? 50)
        .execute<UserNotificationItemRow>();
      return rows.map(fromUserNotificationItemRow);
    },
    async getInboxItem(itemId, userId): Promise<UserNotificationItemRecord | undefined> {
      const row = await database
        .query()
        .selectFrom<UserNotificationItemRow>('userNotificationItems')
        .selectAll()
        .where('id', '=', itemId)
        .where('userId', '=', userId)
        .where('availableAt', 'is not', null)
        .where('deletedAt', 'is', null)
        .executeTakeFirst<UserNotificationItemRow>();
      return row ? fromUserNotificationItemRow(row) : undefined;
    },
    async countUnread(input): Promise<number> {
      let query = database
        .query()
        .selectFrom<UserNotificationItemRow>('userNotificationItems')
        .select((eb) => [eb.fn.countAll<number>().as('total')])
        .where('userId', '=', input.userId)
        .where('availableAt', 'is not', null)
        .where('deletedAt', 'is', null)
        .where('readAt', 'is', null);
      if (input.channel !== undefined) query = query.where('channel', '=', input.channel);
      const row = await query.executeTakeFirst<{ total: number | string | bigint }>();
      return Number(row?.total ?? 0);
    },
    async updateInboxItem(input): Promise<UserNotificationItemRecord | undefined> {
      return database.transaction(async (connection) => {
        const current = await connection.query.selectFrom<UserNotificationItemRow>('userNotificationItems').selectAll().where('id', '=', input.itemId).where('userId', '=', input.userId).executeTakeFirst<UserNotificationItemRow>();
        if (!current || current.version !== input.expectedVersion) return undefined;
        if ((input.action === 'read' && current.readAt) || (input.action === 'unread' && !current.readAt) || (input.action === 'delete' && current.deletedAt)) return fromUserNotificationItemRow(current);
        const values: Partial<UserNotificationItemRow> = { version: current.version + 1, updatedAt: input.changedAt };
        if (input.action === 'read') values.readAt = input.changedAt;
        if (input.action === 'unread') values.readAt = null;
        if (input.action === 'delete') values.deletedAt = input.changedAt;
        let update = connection.query.updateTable<UserNotificationItemRow>('userNotificationItems').set(values).where('id', '=', input.itemId).where('userId', '=', input.userId);
        update = update.where('version', '=', input.expectedVersion);
        const result = await update.execute();
        if (result.updatedCount !== 1) return undefined;
        const row = await connection.query.selectFrom<UserNotificationItemRow>('userNotificationItems').selectAll().where('id', '=', input.itemId).executeTakeFirst<UserNotificationItemRow>();
        return row ? fromUserNotificationItemRow(row) : undefined;
      });
    },
    async markInboxRead(input): Promise<number> {
      return database.transaction(async (connection) => {
        let select = connection.query
          .selectFrom<UserNotificationItemRow>('userNotificationItems')
          .select(['id', 'version'])
          .where('userId', '=', input.userId)
          .where('availableAt', 'is not', null)
          .where('deletedAt', 'is', null)
          .where('readAt', 'is', null)
          .where('createdAt', '<=', input.changedAt);
        if (input.channel !== undefined) select = select.where('channel', '=', input.channel);
        const rows = await select.execute<Pick<UserNotificationItemRow, 'id' | 'version'>>();
        let updated = 0;
        for (const row of rows) {
          const result = await connection.query
            .updateTable<UserNotificationItemRow>('userNotificationItems')
            .set({ readAt: input.changedAt, updatedAt: input.changedAt, version: row.version + 1 })
            .where('id', '=', row.id)
            .where('version', '=', row.version)
            .where('readAt', 'is', null)
            .execute();
          updated += result.updatedCount ?? 0;
        }
        return updated;
      });
    },
  };
  return store;
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
  summaryStatus: NotificationSummaryStatus;
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
  nextRunAt?: string | null;
  leaseToken?: string | null;
  leaseOwner?: string | null;
  leaseExpiresAt?: string | null;
  version: number;
  lastAttemptId?: string;
  lastError?: unknown;
  createdAt: string;
  updatedAt: string;
}

interface UserNotificationItemRow extends Row {
  id: string; deliveryId: string; notificationId: string; userId: string; channel: NotificationChannel;
  availableAt?: string | null; readAt?: string | null; deletedAt?: string | null; createdAt: string; updatedAt: string; version: number;
}

interface DeliveryAttemptRow extends Row {
  id: string; deliveryId: string; attemptSequence: number; providerInstance: string; providerType: string; configRevision?: string;
  status: NotificationStatus; startedAt: string; invocationStartedAt?: string; finishedAt?: string; providerMessageId?: string;
  errorPhase?: string; errorCategory?: string; errorCode?: string; errorMessage?: string; metadata?: unknown; metadataSchemaVersion: number;
  createdAt: string; updatedAt: string;
}

interface DeliveryStatusEventRow extends Row {
  id: string; deliveryId: string; sequence: number; fromStatus?: NotificationStatus; toStatus: NotificationStatus;
  attemptId?: string; reason?: string; actor?: string; occurredAt: string; metadata?: unknown; metadataSchemaVersion: number;
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
  assertSchemaVersion('recipient snapshot', row.recipientSchemaVersion);
  assertSchemaVersion('content snapshot', row.contentSchemaVersion);
  assertSchemaVersion('provider chain snapshot', row.providerChainSchemaVersion);
  return {
    ...row,
    recipientSnapshot: parseJsonObject(row.recipientSnapshot),
    contentSnapshot: parseJsonObject(row.contentSnapshot),
    providerChainSnapshot: parseJsonArray(row.providerChainSnapshot),
    nextRunAt: row.nextRunAt ?? undefined,
    leaseToken: row.leaseToken ?? undefined,
    leaseOwner: row.leaseOwner ?? undefined,
    leaseExpiresAt: row.leaseExpiresAt ?? undefined,
    lastError: row.lastError === undefined || row.lastError === null ? undefined : parseJsonObject(row.lastError),
  };
}

function toUserNotificationItemRow(record: UserNotificationItemRecord): UserNotificationItemRow {
  return { ...record };
}

function fromUserNotificationItemRow(row: UserNotificationItemRow): UserNotificationItemRecord {
  return { ...row, availableAt: row.availableAt ?? undefined, readAt: row.readAt ?? undefined, deletedAt: row.deletedAt ?? undefined };
}

function toDeliveryAttemptRow(record: DeliveryAttemptRecord): DeliveryAttemptRow {
  return { ...record, metadata: record.metadata === undefined ? undefined : JSON.stringify(record.metadata) };
}

function fromDeliveryAttemptRow(row: DeliveryAttemptRow): DeliveryAttemptRecord {
  assertSchemaVersion('attempt metadata', row.metadataSchemaVersion);
  return {
    ...row,
    configRevision: row.configRevision ?? undefined,
    invocationStartedAt: row.invocationStartedAt ?? undefined,
    finishedAt: row.finishedAt ?? undefined,
    providerMessageId: row.providerMessageId ?? undefined,
    errorPhase: row.errorPhase ?? undefined,
    errorCategory: row.errorCategory ?? undefined,
    errorCode: row.errorCode ?? undefined,
    errorMessage: row.errorMessage ?? undefined,
    metadata: row.metadata === undefined || row.metadata === null ? undefined : parseJsonObject(row.metadata),
  };
}

function toDeliveryStatusEventRow(record: DeliveryStatusEventRecord): DeliveryStatusEventRow {
  return { ...record, metadata: record.metadata === undefined ? undefined : JSON.stringify(record.metadata) };
}

function fromDeliveryStatusEventRow(row: DeliveryStatusEventRow): DeliveryStatusEventRecord {
  assertSchemaVersion('status event metadata', row.metadataSchemaVersion);
  return { ...row, metadata: row.metadata === undefined ? undefined : parseJsonObject(row.metadata) };
}

function hasDuplicateIds(records: readonly { id: string }[]): boolean {
  return new Set(records.map((record) => record.id)).size !== records.length;
}

function hasDuplicateEventSequences(events: readonly DeliveryStatusEventRecord[]): boolean {
  const keys = events.map((event) => `${event.deliveryId}:${event.sequence}`);
  return new Set(keys).size !== keys.length;
}

function assertMemoryHistoryAvailable(
  attempts: ReadonlyMap<string, DeliveryAttemptRecord>,
  events: ReadonlyMap<string, DeliveryStatusEventRecord>,
  attempt: DeliveryAttemptRecord | undefined,
  event: DeliveryStatusEventRecord | undefined,
  allowExistingAttempt: boolean,
): void {
  if (
    attempt &&
    ((!allowExistingAttempt && attempts.has(attempt.id)) ||
      [...attempts.values()].some(
        (existing) =>
          existing.id !== attempt.id &&
          existing.deliveryId === attempt.deliveryId &&
          existing.attemptSequence === attempt.attemptSequence,
      ))
  ) {
    throw new Error('Delivery attempt already exists.');
  }
  if (
    event &&
    (events.has(event.id) ||
      [...events.values()].some(
        (existing) => existing.deliveryId === event.deliveryId && existing.sequence === event.sequence,
      ))
  ) {
    throw new Error('Delivery status event already exists.');
  }
}

function validateBundleSchemaVersions(input: NotificationBundle): void {
  for (const delivery of input.deliveries) {
    assertSchemaVersion('recipient snapshot', delivery.recipientSchemaVersion);
    assertSchemaVersion('content snapshot', delivery.contentSchemaVersion);
    assertSchemaVersion('provider chain snapshot', delivery.providerChainSchemaVersion);
  }
  for (const event of input.statusEvents ?? []) {
    assertSchemaVersion('status event metadata', event.metadataSchemaVersion);
  }
}

function validateAttemptAndEventVersions(
  attempt: DeliveryAttemptRecord | undefined,
  event: DeliveryStatusEventRecord | undefined,
): void {
  if (attempt) assertSchemaVersion('attempt metadata', attempt.metadataSchemaVersion);
  if (event) assertSchemaVersion('status event metadata', event.metadataSchemaVersion);
}

function assertSchemaVersion(snapshot: string, version: number): void {
  if (version !== 1) throw new NotificationStoreCompatibilityError(snapshot, version);
}

interface DatabaseRawClient {
  raw(statement: string): Promise<unknown>;
}

async function databaseCurrentTime(connection: DatabaseConnection): Promise<string> {
  const client = await connection.client<DatabaseRawClient>();
  const statement = connection.dialect === 'sqlite'
    ? "select strftime('%Y-%m-%dT%H:%M:%fZ', 'now') as currentTime"
    : 'select CURRENT_TIMESTAMP as currentTime';
  const result = await client.raw(statement);
  const currentTime = findDatabaseTime(result);
  if (!currentTime) throw new Error('Database did not return a valid current timestamp.');
  return currentTime;
}

function findDatabaseTime(value: unknown): string | undefined {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' || typeof value === 'number') {
    const timestamp = new Date(value);
    return Number.isNaN(timestamp.getTime()) ? undefined : timestamp.toISOString();
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findDatabaseTime(item);
      if (found) return found;
    }
    return undefined;
  }
  if (value && typeof value === 'object') {
    for (const key of ['currentTime', 'currenttime', 'current_time', 'rows']) {
      if (key in value) {
        const found = findDatabaseTime(value[key as keyof typeof value]);
        if (found) return found;
      }
    }
  }
  return undefined;
}

function recipientSearchMatches(recipientKey: string, search: string): boolean {
  const normalized = recipientKey.toLowerCase();
  return normalized.startsWith(search) || normalized.startsWith(`user:${search}`) || normalized.startsWith(`email:${search}`);
}

function makeUserItemVisible(items: Map<string, UserNotificationItemRecord>, delivery: DeliveryRecord, changedAt: string): void {
  if (delivery.status !== 'delivered' && delivery.status !== 'accepted') return;
  for (const [id, item] of items) if (item.deliveryId === delivery.id && item.availableAt === undefined) items.set(id, { ...item, availableAt: changedAt, updatedAt: changedAt, version: item.version + 1 });
}

function recomputeMemoryNotification(notifications: Map<string, NotificationRecord>, deliveries: Map<string, DeliveryRecord>, notificationId: string, changedAt: string): void {
  const notification = notifications.get(notificationId);
  if (!notification) return;
  const statuses = [...deliveries.values()].filter((delivery) => delivery.notificationId === notificationId).map((delivery) => delivery.status);
  const nextStatus: NotificationSummaryStatus = summarizeDeliveryStatuses(statuses);
  notifications.set(notificationId, { ...notification, summaryStatus: nextStatus, version: notification.version + 1, updatedAt: changedAt });
}

async function recomputeDatabaseNotification(query: QueryAdapter, notificationId: string, changedAt: string): Promise<void> {
  const rows = await query.selectFrom<DeliveryRow>('notificationDeliveries').select(['status']).where('notificationId', '=', notificationId).execute<Pick<DeliveryRow, 'status'>>();
  const statuses = rows.map((row) => row.status);
  const nextStatus: NotificationSummaryStatus = summarizeDeliveryStatuses(statuses);
  await query.updateTable<NotificationRow>('notifications').set({ summaryStatus: nextStatus, updatedAt: changedAt }).where('id', '=', notificationId).execute();
}

function summarizeDeliveryStatuses(statuses: readonly NotificationStatus[]): NotificationSummaryStatus {
  if (statuses.some((status) => status === 'submission_unknown')) return 'attention_required';
  if (statuses.every((status) => status === 'queued')) return 'queued';
  if (statuses.some((status) => status === 'queued' || status === 'sending')) return 'processing';
  const successful = statuses.filter((status) => status === 'accepted' || status === 'delivered').length;
  if (successful === statuses.length) return 'succeeded';
  return successful > 0 ? 'partially_succeeded' : 'failed';
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
