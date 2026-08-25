import type { DatabaseManager, Row } from '@nocobase/database';

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
  readonly idempotencyKey?: string;
  readonly requestHash?: string;
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
  readonly nextRunAt?: string;
  readonly idempotencyKey: string;
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

export interface NotificationCreateResult {
  readonly created: boolean;
  readonly bundle: NotificationLogBundle;
}

export interface NotificationStore {
  now(): Promise<string>;
  create(bundle: NotificationLogBundle): Promise<NotificationCreateResult>;
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
  finishAttempt(attempt: NotificationAttemptRecord): Promise<void>;
  finishAttemptAndContinue(
    attempt: NotificationAttemptRecord,
    delivery: NotificationDeliveryRecord,
    providerCursor: number,
  ): Promise<NotificationDeliveryRecord | undefined>;
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
  scheduleRetry(
    delivery: NotificationDeliveryRecord,
    nextRunAt: string,
    error: NotificationErrorRecord,
  ): Promise<NotificationDeliveryRecord | undefined>;
  recoverExpired(now: string): Promise<number>;
}

interface NotificationRow extends Row {
  id: string;
  sourceType: string;
  sourceReferenceId?: string;
  idempotencyKey?: string;
  requestHash?: string;
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
  idempotencyKey: string;
  status: NotificationDeliveryStatus;
  statusChangedAt: string;
  nextRunAt?: string | null;
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

  async create(
    bundle: NotificationLogBundle,
  ): Promise<NotificationCreateResult> {
    try {
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
      return { created: true, bundle };
    } catch (error) {
      const existing = await this.getLog(bundle.log.id);
      if (!existing || existing.idempotencyKey !== bundle.log.idempotencyKey)
        throw error;
      if (existing.requestHash !== bundle.log.requestHash)
        throw new Error(
          `Notification idempotency key "${bundle.log.idempotencyKey}" was reused with a different request.`,
          { cause: error },
        );
      return {
        created: false,
        bundle: {
          log: existing,
          deliveries: await this.listDeliveries(existing.id),
        },
      };
    }
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
      .where((builder) =>
        builder.or([
          builder.eb('status', '=', 'pending'),
          builder.eb.and([
            builder.eb('status', '=', 'failed'),
            builder.eb('nextRunAt', '<=', now),
          ]),
        ]),
      )
      .executeTakeFirst<DeliveryRow>();
    if (!current) return undefined;
    const result = await this.database
      .query()
      .updateTable<DeliveryRow>('notificationDeliveries')
      .set({
        status: 'preparing',
        nextRunAt: null,
        leaseToken,
        leaseOwner: 'notification-manager',
        leaseExpiresAt,
        statusChangedAt: now,
        updatedAt: now,
        version: current.version + 1,
      })
      .where('id', '=', id)
      .where('status', 'in', ['pending', 'failed'])
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
    leaseExpiresAt: string,
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
            status: 'submitting',
            statusChangedAt: now,
            leaseExpiresAt,
            updatedAt: now,
            version: delivery.version + 1,
          })
          .where('id', '=', delivery.id)
          .where('status', 'in', ['preparing', 'submitting'])
          .where('leaseToken', '=', delivery.leaseToken ?? '')
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

  async finishAttemptAndContinue(
    attempt: NotificationAttemptRecord,
    delivery: NotificationDeliveryRecord,
    providerCursor: number,
  ): Promise<NotificationDeliveryRecord | undefined> {
    const now = await this.now();
    let committed: boolean;
    try {
      committed = await this.database.transaction(
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
              updatedAt: attempt.finishedAt ?? now,
            })
            .where('id', '=', attempt.id)
            .where('status', '=', 'submitting')
            .execute();
          if (attemptResult.updatedCount !== 1) return false;
          const deliveryResult = await connection.query
            .updateTable<DeliveryRow>('notificationDeliveries')
            .set({
              providerCursor,
              updatedAt: now,
              version: delivery.version + 1,
            })
            .where('id', '=', delivery.id)
            .where('status', '=', 'submitting')
            .where('leaseToken', '=', delivery.leaseToken ?? '')
            .where('version', '=', delivery.version)
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
    if (!committed) return undefined;
    return this.getDelivery(delivery.id);
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
              updatedAt: attempt.finishedAt ?? now,
            })
            .where('id', '=', attempt.id)
            .where('status', '=', 'submitting')
            .execute();
          if (attemptResult.updatedCount !== 1) return false;
          const deliveryResult = await connection.query
            .updateTable<DeliveryRow>('notificationDeliveries')
            .set({
              providerCursor: delivery.providerCursor,
              status,
              nextRunAt: nextRunAt ?? null,
              lastError: error ? JSON.stringify(error) : null,
              leaseToken: null,
              leaseOwner: null,
              leaseExpiresAt: null,
              statusChangedAt: now,
              updatedAt: now,
              version: delivery.version + 1,
            })
            .where('id', '=', delivery.id)
            .where('status', '=', 'submitting')
            .where('leaseToken', '=', delivery.leaseToken ?? '')
            .where('version', '=', delivery.version)
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
    if (next) await this.refreshLog(next.notificationId);
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
        leaseOwner: null,
        leaseExpiresAt: null,
        statusChangedAt: now,
        updatedAt: now,
        version: delivery.version + 1,
      })
      .where('id', '=', delivery.id)
      .where('status', 'in', ['preparing', 'submitting'])
      .where('leaseToken', '=', delivery.leaseToken ?? '')
      .where('version', '=', delivery.version)
      .execute();
    if (result.updatedCount !== 1) return undefined;
    const next = await this.getDelivery(delivery.id);
    if (next) await this.refreshLog(next.notificationId);
    return next;
  }

  async scheduleRetry(
    delivery: NotificationDeliveryRecord,
    nextRunAt: string,
    error: NotificationErrorRecord,
  ): Promise<NotificationDeliveryRecord | undefined> {
    const now = await this.now();
    const result = await this.database
      .query()
      .updateTable<DeliveryRow>('notificationDeliveries')
      .set({
        status: 'failed',
        nextRunAt,
        lastError: JSON.stringify(error),
        leaseToken: null,
        leaseOwner: null,
        leaseExpiresAt: null,
        statusChangedAt: now,
        updatedAt: now,
        version: delivery.version + 1,
      })
      .where('id', '=', delivery.id)
      .where('status', '=', 'submitting')
      .where('leaseToken', '=', delivery.leaseToken ?? '')
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
      .where('status', 'in', ['preparing', 'submitting'])
      .where('leaseExpiresAt', '<=', now)
      .execute<DeliveryRow>();
    let recoveredCount = 0;
    for (const row of rows) {
      const delivery = fromDeliveryRow(row);
      if (row.status === 'preparing') {
        const result = await this.database
          .query()
          .updateTable<DeliveryRow>('notificationDeliveries')
          .set({
            status: 'pending',
            leaseToken: null,
            leaseOwner: null,
            leaseExpiresAt: null,
            statusChangedAt: now,
            updatedAt: now,
            version: row.version + 1,
          })
          .where('id', '=', row.id)
          .where('status', '=', 'preparing')
          .where('leaseExpiresAt', '<=', now)
          .where('version', '=', row.version)
          .execute();
        if (result.updatedCount === 1) {
          await this.refreshLog(delivery.notificationId);
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
                leaseOwner: null,
                leaseExpiresAt: null,
                statusChangedAt: now,
                updatedAt: now,
                version: row.version + 1,
              })
              .where('id', '=', row.id)
              .where('status', '=', 'submitting')
              .where('leaseExpiresAt', '<=', now)
              .where('version', '=', row.version)
              .execute();
            if (result.updatedCount !== 1) return false;
            if (!row.lastAttemptId) return true;
            await connection.query
              .updateTable<AttemptRow>('notificationDeliveryAttempts')
              .set({
                status: 'unknown',
                finishedAt: now,
                errorCode: error.code,
                errorMessage: error.message,
                updatedAt: now,
              })
              .where('id', '=', row.lastAttemptId)
              .where('status', '=', 'submitting')
              .execute();
            return true;
          },
        );
        if (recovered) {
          await this.refreshLog(delivery.notificationId);
          recoveredCount += 1;
        }
      }
    }
    return recoveredCount;
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
    idempotencyKey: record.idempotencyKey,
    requestHash: record.requestHash,
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
    idempotencyKey: row.idempotencyKey,
    requestHash: row.requestHash,
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
    nextRunAt: record.nextRunAt,
    idempotencyKey: record.idempotencyKey,
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
    nextRunAt: row.nextRunAt ?? undefined,
    idempotencyKey: row.idempotencyKey,
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
