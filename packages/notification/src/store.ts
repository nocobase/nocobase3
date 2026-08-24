import type { DatabaseManager, Row } from '@nocobase/database';

export type NotificationLogStatus =
  'pending' | 'processing' | 'completed' | 'partial' | 'failed' | 'unknown';
export type NotificationDeliveryStatus =
  'pending' | 'sending' | 'sent' | 'failed' | 'unknown';
export type NotificationAttemptStatus =
  'sending' | 'sent' | 'failed' | 'unknown';

export interface NotificationErrorRecord {
  readonly code?: string;
  readonly message: string;
  readonly category?: string;
}

export interface NotificationLogRecord {
  readonly id: string;
  readonly sourceType: string;
  readonly sourceReferenceId?: string;
  readonly messageSnapshot: Readonly<Record<string, object>>;
  readonly status: NotificationLogStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface NotificationDeliveryRecord {
  readonly id: string;
  readonly notificationId: string;
  readonly channel: string;
  readonly recipientKey: string;
  readonly recipientSnapshot: object;
  readonly messageSnapshot: object;
  readonly providerChain: readonly string[];
  readonly providerCursor: number;
  readonly attemptCount: number;
  readonly status: NotificationDeliveryStatus;
  readonly leaseToken?: string;
  readonly leaseExpiresAt?: string;
  readonly lastError?: NotificationErrorRecord;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly version: number;
}

export interface NotificationAttemptRecord {
  readonly id: string;
  readonly deliveryId: string;
  readonly sequence: number;
  readonly providerName: string;
  readonly providerType: string;
  readonly status: NotificationAttemptStatus;
  readonly startedAt: string;
  readonly finishedAt?: string;
  readonly providerMessageId?: string;
  readonly error?: NotificationErrorRecord;
}

export interface NotificationLogBundle {
  readonly log: NotificationLogRecord;
  readonly deliveries: readonly NotificationDeliveryRecord[];
}

export interface NotificationStore {
  now(): Promise<string>;
  create(bundle: NotificationLogBundle): Promise<void>;
  getLog(id: string): Promise<NotificationLogRecord | undefined>;
  listLogs(limit?: number): Promise<readonly NotificationLogRecord[]>;
  getDelivery(id: string): Promise<NotificationDeliveryRecord | undefined>;
  listDeliveries(
    notificationId: string,
  ): Promise<readonly NotificationDeliveryRecord[]>;
  listPending(limit?: number): Promise<readonly NotificationDeliveryRecord[]>;
  listAttempts(
    deliveryId: string,
  ): Promise<readonly NotificationAttemptRecord[]>;
  claimDelivery(
    id: string,
    leaseToken: string,
    leaseExpiresAt: string,
  ): Promise<NotificationDeliveryRecord | undefined>;
  startAttempt(
    delivery: NotificationDeliveryRecord,
    attempt: NotificationAttemptRecord,
  ): Promise<NotificationDeliveryRecord | undefined>;
  finishAttempt(attempt: NotificationAttemptRecord): Promise<void>;
  finishDelivery(
    delivery: NotificationDeliveryRecord,
    status: Exclude<NotificationDeliveryStatus, 'pending' | 'sending'>,
    error?: NotificationErrorRecord,
  ): Promise<NotificationDeliveryRecord | undefined>;
  recoverExpired(now: string): Promise<number>;
}

interface NotificationRow extends Row {
  id: string;
  sourceType: string;
  sourceReferenceId?: string;
  principalService: string;
  triggeredAt: string;
  messageMode: string;
  templateName?: string;
  templateVersion?: string;
  summaryStatus: NotificationLogStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
}

interface DeliveryRow extends Row {
  id: string;
  notificationId: string;
  channel: string;
  recipientKey: string;
  recipientSnapshot: object | string;
  recipientSchemaVersion: number;
  contentSnapshot: object | string;
  contentSchemaVersion: number;
  providerChainSnapshot: readonly string[] | string;
  providerChainSchemaVersion: number;
  providerCursor: number;
  currentAttempt: number;
  status: NotificationDeliveryStatus;
  statusChangedAt: string;
  nextRunAt?: string;
  leaseToken?: string | null;
  leaseOwner?: string | null;
  leaseExpiresAt?: string | null;
  version: number;
  lastAttemptId?: string;
  lastError?: NotificationErrorRecord | string | null;
  createdAt: string;
  updatedAt: string;
}

interface AttemptRow extends Row {
  id: string;
  deliveryId: string;
  attemptSequence: number;
  providerInstance: string;
  providerType: string;
  status: NotificationAttemptStatus;
  startedAt: string;
  finishedAt?: string;
  providerMessageId?: string;
  errorCategory?: string;
  errorCode?: string;
  errorMessage?: string;
  metadataSchemaVersion: number;
  createdAt: string;
  updatedAt: string;
}

export class DatabaseNotificationStore implements NotificationStore {
  constructor(private readonly database: DatabaseManager) {}
  async now(): Promise<string> {
    return new Date().toISOString();
  }

  async create(bundle: NotificationLogBundle): Promise<void> {
    await this.database.transaction(async (connection): Promise<void> => {
      await connection.query
        .insertInto<NotificationRow>('notifications')
        .values(toLogRow(bundle.log))
        .execute();
      if (bundle.deliveries.length > 0)
        await connection.query
          .insertInto<DeliveryRow>('notificationDeliveries')
          .values(bundle.deliveries.map(toDeliveryRow))
          .execute();
    });
  }

  async getLog(id: string): Promise<NotificationLogRecord | undefined> {
    const row = await this.database
      .query()
      .selectFrom<NotificationRow>('notifications')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst<NotificationRow>();
    return row ? fromLogRow(row, await this.listDeliveries(id)) : undefined;
  }

  async listLogs(
    limit: number = 100,
  ): Promise<readonly NotificationLogRecord[]> {
    const rows = await this.database
      .query()
      .selectFrom<NotificationRow>('notifications')
      .selectAll()
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .execute<NotificationRow>();
    return Promise.all(
      rows.map(async (row): Promise<NotificationLogRecord> =>
        fromLogRow(row, await this.listDeliveries(row.id)),
      ),
    );
  }

  async getDelivery(
    id: string,
  ): Promise<NotificationDeliveryRecord | undefined> {
    const row = await this.database
      .query()
      .selectFrom<DeliveryRow>('notificationDeliveries')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst<DeliveryRow>();
    return row ? fromDeliveryRow(row) : undefined;
  }

  async listDeliveries(
    notificationId: string,
  ): Promise<readonly NotificationDeliveryRecord[]> {
    const rows = await this.database
      .query()
      .selectFrom<DeliveryRow>('notificationDeliveries')
      .selectAll()
      .where('notificationId', '=', notificationId)
      .execute<DeliveryRow>();
    return rows.map(fromDeliveryRow);
  }

  async listPending(
    limit: number = 100,
  ): Promise<readonly NotificationDeliveryRecord[]> {
    const rows = await this.database
      .query()
      .selectFrom<DeliveryRow>('notificationDeliveries')
      .selectAll()
      .where('status', '=', 'pending')
      .orderBy('createdAt', 'asc')
      .limit(limit)
      .execute<DeliveryRow>();
    return rows.map(fromDeliveryRow);
  }

  async listAttempts(
    deliveryId: string,
  ): Promise<readonly NotificationAttemptRecord[]> {
    const rows = await this.database
      .query()
      .selectFrom<AttemptRow>('notificationDeliveryAttempts')
      .selectAll()
      .where('deliveryId', '=', deliveryId)
      .orderBy('attemptSequence', 'asc')
      .execute<AttemptRow>();
    return rows.map(fromAttemptRow);
  }

  async claimDelivery(
    id: string,
    leaseToken: string,
    leaseExpiresAt: string,
  ): Promise<NotificationDeliveryRecord | undefined> {
    const now = await this.now();
    const current = await this.database
      .query()
      .selectFrom<DeliveryRow>('notificationDeliveries')
      .selectAll()
      .where('id', '=', id)
      .where('status', '=', 'pending')
      .executeTakeFirst<DeliveryRow>();
    if (!current) return undefined;
    const result = await this.database
      .query()
      .updateTable<DeliveryRow>('notificationDeliveries')
      .set({
        status: 'sending',
        leaseToken,
        leaseOwner: 'notification-manager',
        leaseExpiresAt,
        statusChangedAt: now,
        updatedAt: now,
        version: current.version + 1,
      })
      .where('id', '=', id)
      .where('status', '=', 'pending')
      .where('version', '=', current.version)
      .execute();
    if (result.updatedCount !== 1) return undefined;
    const delivery = await this.getDelivery(id);
    if (delivery) await this.refreshLog(delivery.notificationId);
    return delivery;
  }

  async startAttempt(
    delivery: NotificationDeliveryRecord,
    attempt: NotificationAttemptRecord,
  ): Promise<NotificationDeliveryRecord | undefined> {
    const now = await this.now();
    return this.database.transaction(
      async (connection): Promise<NotificationDeliveryRecord | undefined> => {
        const result = await connection.query
          .updateTable<DeliveryRow>('notificationDeliveries')
          .set({
            providerCursor: delivery.providerCursor,
            currentAttempt: attempt.sequence,
            lastAttemptId: attempt.id,
            updatedAt: now,
            version: delivery.version + 1,
          })
          .where('id', '=', delivery.id)
          .where('status', '=', 'sending')
          .where('version', '=', delivery.version)
          .execute();
        if (result.updatedCount !== 1) return undefined;
        await connection.query
          .insertInto<AttemptRow>('notificationDeliveryAttempts')
          .values(toAttemptRow(attempt))
          .execute();
        const row = await connection.query
          .selectFrom<DeliveryRow>('notificationDeliveries')
          .selectAll()
          .where('id', '=', delivery.id)
          .executeTakeFirst<DeliveryRow>();
        return row ? fromDeliveryRow(row) : undefined;
      },
    );
  }

  async finishAttempt(attempt: NotificationAttemptRecord): Promise<void> {
    await this.database
      .query()
      .updateTable<AttemptRow>('notificationDeliveryAttempts')
      .set(toAttemptRow(attempt))
      .where('id', '=', attempt.id)
      .execute();
  }

  async finishDelivery(
    delivery: NotificationDeliveryRecord,
    status: Exclude<NotificationDeliveryStatus, 'pending' | 'sending'>,
    error?: NotificationErrorRecord,
  ): Promise<NotificationDeliveryRecord | undefined> {
    const now = await this.now();
    const result = await this.database
      .query()
      .updateTable<DeliveryRow>('notificationDeliveries')
      .set({
        status,
        lastError: error ? JSON.stringify(error) : null,
        leaseToken: null,
        leaseOwner: null,
        leaseExpiresAt: null,
        statusChangedAt: now,
        updatedAt: now,
        version: delivery.version + 1,
      })
      .where('id', '=', delivery.id)
      .where('status', '=', 'sending')
      .where('version', '=', delivery.version)
      .execute();
    if (result.updatedCount !== 1) return undefined;
    const next = await this.getDelivery(delivery.id);
    if (next) await this.refreshLog(next.notificationId);
    return next;
  }

  async recoverExpired(now: string): Promise<number> {
    const rows = await this.database
      .query()
      .selectFrom<DeliveryRow>('notificationDeliveries')
      .selectAll()
      .where('status', '=', 'sending')
      .where('leaseExpiresAt', '<=', now)
      .execute<DeliveryRow>();
    for (const row of rows)
      await this.finishDelivery(fromDeliveryRow(row), 'unknown', {
        code: 'LEASE_EXPIRED',
        message: 'Provider result is unknown after worker interruption.',
      });
    return rows.length;
  }

  private async refreshLog(notificationId: string): Promise<void> {
    await this.database
      .query()
      .updateTable<NotificationRow>('notifications')
      .set({
        summaryStatus: summarize(await this.listDeliveries(notificationId)),
        updatedAt: await this.now(),
      })
      .where('id', '=', notificationId)
      .execute();
  }
}

export function createDatabaseNotificationStore(
  database: DatabaseManager,
): NotificationStore {
  return new DatabaseNotificationStore(database);
}

function summarize(
  deliveries: readonly NotificationDeliveryRecord[],
): NotificationLogStatus {
  if (deliveries.some((item) => item.status === 'unknown')) return 'unknown';
  if (deliveries.every((item) => item.status === 'pending')) return 'pending';
  if (
    deliveries.some(
      (item) => item.status === 'pending' || item.status === 'sending',
    )
  )
    return 'processing';
  if (deliveries.every((item) => item.status === 'sent')) return 'completed';
  if (deliveries.every((item) => item.status === 'failed')) return 'failed';
  return 'partial';
}

function toLogRow(record: NotificationLogRecord): NotificationRow {
  return {
    id: record.id,
    sourceType: record.sourceType,
    sourceReferenceId: record.sourceReferenceId,
    principalService: 'notification-manager',
    triggeredAt: record.createdAt,
    messageMode: 'direct',
    summaryStatus: record.status,
    version: 1,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function fromLogRow(
  row: NotificationRow,
  deliveries: readonly NotificationDeliveryRecord[],
): NotificationLogRecord {
  const messageSnapshot: Record<string, object> = {};
  for (const delivery of deliveries)
    messageSnapshot[delivery.channel] = delivery.messageSnapshot;
  return {
    id: row.id,
    sourceType: row.sourceType,
    sourceReferenceId: row.sourceReferenceId,
    messageSnapshot,
    status: row.summaryStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toDeliveryRow(record: NotificationDeliveryRecord): DeliveryRow {
  return {
    id: record.id,
    notificationId: record.notificationId,
    channel: record.channel,
    recipientKey: record.recipientKey,
    recipientSnapshot: JSON.stringify(record.recipientSnapshot),
    recipientSchemaVersion: 1,
    contentSnapshot: JSON.stringify(record.messageSnapshot),
    contentSchemaVersion: 1,
    // node-postgres serializes JavaScript arrays as PostgreSQL array literals,
    // which are not valid input for a JSON column. Serialize explicitly at the
    // persistence boundary so every dialect receives valid JSON.
    providerChainSnapshot: JSON.stringify(record.providerChain),
    providerChainSchemaVersion: 1,
    providerCursor: record.providerCursor,
    currentAttempt: record.attemptCount,
    status: record.status,
    statusChangedAt: record.updatedAt,
    leaseToken: record.leaseToken,
    leaseExpiresAt: record.leaseExpiresAt,
    version: record.version,
    lastError: record.lastError,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function fromDeliveryRow(row: DeliveryRow): NotificationDeliveryRecord {
  return {
    id: row.id,
    notificationId: row.notificationId,
    channel: row.channel,
    recipientKey: row.recipientKey,
    recipientSnapshot: parseObject(row.recipientSnapshot, 'recipient'),
    messageSnapshot: parseObject(row.contentSnapshot, 'content'),
    providerChain: parseProviderChain(row.providerChainSnapshot),
    providerCursor: row.providerCursor,
    attemptCount: row.currentAttempt,
    status: row.status,
    leaseToken: row.leaseToken ?? undefined,
    leaseExpiresAt: row.leaseExpiresAt ?? undefined,
    lastError: parseError(row.lastError),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    version: row.version,
  };
}

function parseProviderChain(
  value: readonly string[] | string,
): readonly string[] {
  if (typeof value !== 'string') return value;
  const parsed: unknown = JSON.parse(value);
  if (
    !Array.isArray(parsed) ||
    !parsed.every((item) => typeof item === 'string')
  )
    throw new Error('Stored notification Provider chain is invalid.');
  return parsed;
}

function parseObject(value: object | string, label: string): object {
  if (typeof value !== 'string') return value;
  const parsed: unknown = JSON.parse(value);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    throw new Error(`Stored notification ${label} snapshot is invalid.`);
  return parsed;
}

function parseError(
  value: NotificationErrorRecord | string | null | undefined,
): NotificationErrorRecord | undefined {
  if (!value) return undefined;
  if (typeof value !== 'string') return value;
  const parsed: unknown = JSON.parse(value);
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    !('message' in parsed) ||
    typeof parsed.message !== 'string'
  )
    throw new Error('Stored notification error is invalid.');
  return parsed as NotificationErrorRecord;
}

function toAttemptRow(record: NotificationAttemptRecord): AttemptRow {
  return {
    id: record.id,
    deliveryId: record.deliveryId,
    attemptSequence: record.sequence,
    providerInstance: record.providerName,
    providerType: record.providerType,
    status: record.status,
    startedAt: record.startedAt,
    finishedAt: record.finishedAt,
    providerMessageId: record.providerMessageId,
    errorCategory: record.error?.category,
    errorCode: record.error?.code,
    errorMessage: record.error?.message,
    metadataSchemaVersion: 1,
    createdAt: record.startedAt,
    updatedAt: record.finishedAt ?? record.startedAt,
  };
}

function fromAttemptRow(row: AttemptRow): NotificationAttemptRecord {
  const error = row.errorMessage
    ? {
        ...(row.errorCategory ? { category: row.errorCategory } : {}),
        ...(row.errorCode ? { code: row.errorCode } : {}),
        message: row.errorMessage,
      }
    : undefined;
  return {
    id: row.id,
    deliveryId: row.deliveryId,
    sequence: row.attemptSequence,
    providerName: row.providerInstance,
    providerType: row.providerType,
    status: row.status,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    providerMessageId: row.providerMessageId,
    error,
  };
}
