import type { DatabaseManager, Row } from '@nocobase/app-database';

export type NotificationLogStatus =
  'pending' | 'processing' | 'completed' | 'partial' | 'failed' | 'unknown';
export type NotificationDeliveryStatus =
  'pending' | 'preparing' | 'submitting' | 'accepted' | 'failed' | 'unknown';
export type NotificationAttemptStatus =
  'submitting' | 'accepted' | 'failed' | 'unknown';

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
  readonly recipientSnapshot: object;
  readonly messageSnapshot: object;
  readonly providerName: string;
  readonly providerType: string;
  readonly attemptCount: number;
  readonly status: NotificationDeliveryStatus;
  readonly nextRunAt?: string;
  readonly leaseToken?: string;
  readonly leaseExpiresAt?: string;
  readonly lastError?: NotificationErrorRecord;
  readonly createdAt: string;
  readonly updatedAt: string;
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
  listReady(
    now: string,
    limit?: number,
  ): Promise<readonly NotificationDeliveryRecord[]>;
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
    leaseExpiresAt: string,
  ): Promise<NotificationDeliveryRecord | undefined>;
  renewLease(
    id: string,
    leaseToken: string,
    leaseExpiresAt: string,
  ): Promise<boolean>;
  finishAttemptAndDelivery(
    attempt: NotificationAttemptRecord,
    delivery: NotificationDeliveryRecord,
    status: Extract<
      NotificationDeliveryStatus,
      'accepted' | 'failed' | 'unknown'
    >,
    error?: NotificationErrorRecord,
    nextRunAt?: string,
  ): Promise<NotificationDeliveryRecord | undefined>;
  finishDelivery(
    delivery: NotificationDeliveryRecord,
    status: Extract<
      NotificationDeliveryStatus,
      'accepted' | 'failed' | 'unknown'
    >,
    error?: NotificationErrorRecord,
  ): Promise<NotificationDeliveryRecord | undefined>;
  recoverExpired(now: string): Promise<number>;
}

interface NotificationRow extends Row {
  id: string;
  sourceType: string;
  sourceReferenceId?: string;
  createdAt: string;
  updatedAt: string;
}

interface DeliveryRow extends Row {
  id: string;
  notificationId: string;
  channel: string;
  recipientSnapshot: object | string;
  messageSnapshot: object | string;
  providerName: string;
  providerType: string;
  attemptCount: number;
  status: NotificationDeliveryStatus;
  nextRunAt?: string | null;
  leaseToken?: string | null;
  leaseExpiresAt?: string | null;
  lastError?: NotificationErrorRecord | string | null;
  createdAt: string;
  updatedAt: string;
}

interface AttemptRow extends Row {
  id: string;
  deliveryId: string;
  sequence: number;
  providerName: string;
  providerType: string;
  status: NotificationAttemptStatus;
  startedAt: string;
  finishedAt?: string;
  providerMessageId?: string;
  errorCategory?: string;
  errorCode?: string;
  errorMessage?: string;
}

export class DatabaseNotificationStore implements NotificationStore {
  constructor(private readonly database: DatabaseManager) {}
  async now(): Promise<string> {
    return new Date().toISOString();
  }

  async create(bundle: NotificationLogBundle): Promise<void> {
    await this.database.transaction(async (connection): Promise<void> => {
      await connection.query
        .insertInto<NotificationRow>('notificationDispatches')
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
      .selectFrom<NotificationRow>('notificationDispatches')
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
      .selectFrom<NotificationRow>('notificationDispatches')
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

  async listReady(
    now: string,
    limit: number = 100,
  ): Promise<readonly NotificationDeliveryRecord[]> {
    const rows = await this.database
      .query()
      .selectFrom<DeliveryRow>('notificationDeliveries')
      .selectAll()
      .where((builder) =>
        builder.or([
          builder.eb('status', '=', 'pending'),
          builder.eb.and([
            builder.eb('status', '=', 'failed'),
            builder.eb('nextRunAt', '<=', now),
          ]),
        ]),
      )
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
      .orderBy('sequence', 'asc')
      .execute<AttemptRow>();
    return rows.map(fromAttemptRow);
  }

  async claimDelivery(
    id: string,
    leaseToken: string,
    leaseExpiresAt: string,
  ): Promise<NotificationDeliveryRecord | undefined> {
    const now = await this.now();
    const result = await this.database
      .query()
      .updateTable<DeliveryRow>('notificationDeliveries')
      .set({
        status: 'preparing',
        nextRunAt: null,
        leaseToken,
        leaseExpiresAt,
        updatedAt: now,
      })
      .where('id', '=', id)
      .where((builder) =>
        builder.or([
          builder.eb('status', '=', 'pending'),
          builder.eb.and([
            builder.eb('status', '=', 'failed'),
            builder.eb('nextRunAt', '<=', now),
          ]),
        ]),
      )
      .execute();
    if (result.updatedCount !== 1) return undefined;
    return this.getDelivery(id);
  }

  async startAttempt(
    delivery: NotificationDeliveryRecord,
    attempt: NotificationAttemptRecord,
    leaseExpiresAt: string,
  ): Promise<NotificationDeliveryRecord | undefined> {
    const now = await this.now();
    return this.database.transaction(
      async (connection): Promise<NotificationDeliveryRecord | undefined> => {
        const result = await connection.query
          .updateTable<DeliveryRow>('notificationDeliveries')
          .set({
            attemptCount: attempt.sequence,
            status: 'submitting',
            leaseExpiresAt,
            updatedAt: now,
          })
          .where('id', '=', delivery.id)
          .where('status', 'in', ['preparing', 'submitting'])
          .where('leaseToken', '=', delivery.leaseToken ?? '')
          .where('attemptCount', '=', delivery.attemptCount)
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
    const now = await this.now();
    let result: boolean;
    try {
      result = await this.database.transaction(
        async (connection): Promise<boolean> => {
          const attemptResult = await connection.query
            .updateTable<AttemptRow>('notificationDeliveryAttempts')
            .set({
              status: attempt.status,
              finishedAt: attempt.finishedAt,
              providerMessageId: attempt.providerMessageId,
              errorCategory: attempt.error?.category,
              errorCode: attempt.error?.code,
              errorMessage: attempt.error?.message,
            })
            .where('id', '=', attempt.id)
            .where('status', '=', 'submitting')
            .execute();
          if (attemptResult.updatedCount !== 1) return false;
          const deliveryResult = await connection.query
            .updateTable<DeliveryRow>('notificationDeliveries')
            .set({
              status,
              nextRunAt: nextRunAt ?? null,
              lastError: error ? JSON.stringify(error) : null,
              leaseToken: null,
              leaseExpiresAt: null,
              updatedAt: now,
            })
            .where('id', '=', delivery.id)
            .where('status', '=', 'submitting')
            .where('leaseToken', '=', delivery.leaseToken ?? '')
            .execute();
          if (deliveryResult.updatedCount !== 1)
            throw new StaleNotificationTransitionError();
          return true;
        },
      );
    } catch (error) {
      if (error instanceof StaleNotificationTransitionError) return undefined;
      throw error;
    }
    if (!result) return undefined;
    const next = await this.getDelivery(delivery.id);
    return next;
  }

  async renewLease(
    id: string,
    leaseToken: string,
    leaseExpiresAt: string,
  ): Promise<boolean> {
    const result = await this.database
      .query()
      .updateTable<DeliveryRow>('notificationDeliveries')
      .set({ leaseExpiresAt, updatedAt: await this.now() })
      .where('id', '=', id)
      .where('status', 'in', ['preparing', 'submitting'])
      .where('leaseToken', '=', leaseToken)
      .execute();
    return result.updatedCount === 1;
  }

  async finishDelivery(
    delivery: NotificationDeliveryRecord,
    status: Extract<
      NotificationDeliveryStatus,
      'accepted' | 'failed' | 'unknown'
    >,
    error?: NotificationErrorRecord,
  ): Promise<NotificationDeliveryRecord | undefined> {
    const now = await this.now();
    const result = await this.database
      .query()
      .updateTable<DeliveryRow>('notificationDeliveries')
      .set({
        status,
        nextRunAt: null,
        lastError: error ? JSON.stringify(error) : null,
        leaseToken: null,
        leaseExpiresAt: null,
        updatedAt: now,
      })
      .where('id', '=', delivery.id)
      .where('status', 'in', ['preparing', 'submitting'])
      .where('leaseToken', '=', delivery.leaseToken ?? '')
      .execute();
    if (result.updatedCount !== 1) return undefined;
    const next = await this.getDelivery(delivery.id);
    return next;
  }

  async recoverExpired(now: string): Promise<number> {
    const rows = await this.database
      .query()
      .selectFrom<DeliveryRow>('notificationDeliveries')
      .selectAll()
      .where('status', 'in', ['preparing', 'submitting'])
      .where('leaseExpiresAt', '<=', now)
      .execute<DeliveryRow>();
    let recoveredCount = 0;
    for (const row of rows) {
      if (row.status === 'preparing') {
        const result = await this.database
          .query()
          .updateTable<DeliveryRow>('notificationDeliveries')
          .set({
            status: 'pending',
            leaseToken: null,
            leaseExpiresAt: null,
            updatedAt: now,
          })
          .where('id', '=', row.id)
          .where('status', '=', 'preparing')
          .where('leaseExpiresAt', '<=', now)
          .execute();
        if (result.updatedCount === 1) {
          recoveredCount += 1;
        }
      } else {
        const error: NotificationErrorRecord = {
          code: 'LEASE_EXPIRED',
          message: 'Provider result is unknown after worker interruption.',
        };
        const recovered = await this.database.transaction(
          async (connection): Promise<boolean> => {
            const result = await connection.query
              .updateTable<DeliveryRow>('notificationDeliveries')
              .set({
                status: 'unknown',
                nextRunAt: null,
                lastError: JSON.stringify(error),
                leaseToken: null,
                leaseExpiresAt: null,
                updatedAt: now,
              })
              .where('id', '=', row.id)
              .where('status', '=', 'submitting')
              .where('leaseExpiresAt', '<=', now)
              .execute();
            if (result.updatedCount !== 1) return false;
            await connection.query
              .updateTable<AttemptRow>('notificationDeliveryAttempts')
              .set({
                status: 'unknown',
                finishedAt: now,
                errorCode: error.code,
                errorMessage: error.message,
              })
              .where('deliveryId', '=', row.id)
              .where('sequence', '=', row.attemptCount)
              .where('status', '=', 'submitting')
              .execute();
            return true;
          },
        );
        if (recovered) {
          recoveredCount += 1;
        }
      }
    }
    return recoveredCount;
  }
}

class StaleNotificationTransitionError extends Error {}

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
      (item) =>
        item.status === 'pending' ||
        item.status === 'preparing' ||
        item.status === 'submitting' ||
        (item.status === 'failed' && item.nextRunAt !== undefined),
    )
  )
    return 'processing';
  if (deliveries.every((item) => item.status === 'accepted'))
    return 'completed';
  if (
    deliveries.every(
      (item) => item.status === 'failed' && item.nextRunAt === undefined,
    )
  )
    return 'failed';
  return 'partial';
}

function toLogRow(record: NotificationLogRecord): NotificationRow {
  return {
    id: record.id,
    sourceType: record.sourceType,
    sourceReferenceId: record.sourceReferenceId,
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
    status: summarize(deliveries),
    createdAt: row.createdAt,
    updatedAt: deliveries.reduce(
      (latest, delivery) =>
        delivery.updatedAt > latest ? delivery.updatedAt : latest,
      row.updatedAt,
    ),
  };
}

function toDeliveryRow(record: NotificationDeliveryRecord): DeliveryRow {
  return {
    id: record.id,
    notificationId: record.notificationId,
    channel: record.channel,
    recipientSnapshot: JSON.stringify(record.recipientSnapshot),
    messageSnapshot: JSON.stringify(record.messageSnapshot),
    providerName: record.providerName,
    providerType: record.providerType,
    attemptCount: record.attemptCount,
    status: record.status,
    nextRunAt: record.nextRunAt,
    leaseToken: record.leaseToken,
    leaseExpiresAt: record.leaseExpiresAt,
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
    recipientSnapshot: parseObject(row.recipientSnapshot, 'recipient'),
    messageSnapshot: parseObject(row.messageSnapshot, 'message'),
    providerName: row.providerName,
    providerType: row.providerType,
    attemptCount: row.attemptCount,
    status: row.status,
    nextRunAt: row.nextRunAt ?? undefined,
    leaseToken: row.leaseToken ?? undefined,
    leaseExpiresAt: row.leaseExpiresAt ?? undefined,
    lastError: parseError(row.lastError),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
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
    sequence: record.sequence,
    providerName: record.providerName,
    providerType: record.providerType,
    status: record.status,
    startedAt: record.startedAt,
    finishedAt: record.finishedAt,
    providerMessageId: record.providerMessageId,
    errorCategory: record.error?.category,
    errorCode: record.error?.code,
    errorMessage: record.error?.message,
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
    sequence: row.sequence,
    providerName: row.providerName,
    providerType: row.providerType,
    status: row.status,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    providerMessageId: row.providerMessageId,
    error,
  };
}
