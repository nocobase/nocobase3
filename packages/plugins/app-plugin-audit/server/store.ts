import { createHash } from 'node:crypto';
import { types } from 'node:util';
import {
  transactionAuthority,
  type DatabaseConnection,
  type TransactionHandle,
} from '@nocobase/db';
import type {
  AuditEventDto,
  AuditEventLookup,
  ResourceRef,
  AuditReceipt,
  AuditRecordOptions,
  TrustedAuditScope,
} from './contracts.js';
import { normalizeEvent } from './event-normalizer.js';
import {
  snapshotStoredEvent,
  normalizeCollectorMetadata,
} from './collector-metadata.js';
import { AuditError } from './errors.js';
import type { AuditStore } from './internal-contracts.js';
import type { AuditEventsQuery, AuditEventsPage } from './contracts.js';
import { queryAuditStore } from './store-query.js';
import { assertAuditSchema } from './database/schema-check.js';
import type { PayloadLimits } from './payload-guard.js';

import { auditRows, storedText, auditRaw } from './database/sql-client.js';
export type StoredAuditReceipt = Extract<
  AuditReceipt,
  { state: 'committed' | 'pending-commit' }
>;
export interface AuditStoreBinding {
  readonly appId: string;
  readonly securityScope?: string;
  readonly store: string;
}
function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
function scopeEncoding(value: string | undefined): string {
  return JSON.stringify(value === undefined ? ['absent'] : ['value', value]);
}

/** Internal persistence only. It does not implement browser authorization or collector lifecycle. */
export class PortableAuditStore implements AuditStore {
  readonly binding: AuditStoreBinding;
  private owner?: { managerId: string; connectionId: string };

  constructor(
    private readonly connection: DatabaseConnection,
    binding: AuditStoreBinding,
  ) {
    this.binding = Object.freeze({ ...binding });
  }

  /** Called by explicit assembly after migrations, never from a record operation. */
  async prepare(): Promise<void> {
    this.owner = undefined;
    if (
      !['sqlite', 'postgres', 'mysql'].includes(this.connection.dialect) ||
      transactionAuthority.current(this.connection) ||
      this.binding.store !== this.connection.name
    ) {
      throw new AuditError('AUDIT_TARGET_UNSUPPORTED');
    }
    try {
      const owner = await this.connection.transaction(async (connection) => {
        await auditRows(
          connection,
          'SELECT "id", "payload", "fingerprint", "idempotencyHash", "idempotencyScope", "appId", "securityScope", "store", "occurredAt", "targetKeyHash", "targetKeyEncoding" FROM "auditEvents" LIMIT 0',
        );
        await auditRows(
          connection,
          'SELECT "scopeHash", "revision", "settings" FROM "auditSettings" LIMIT 0',
        );
        await assertAuditSchema(connection);
        const handle = transactionAuthority.current(connection);
        if (!handle) throw new AuditError('AUDIT_NOT_READY');
        return {
          managerId: handle.managerId,
          connectionId: handle.connectionId,
        };
      });
      this.owner = owner;
    } catch {
      throw new AuditError('AUDIT_NOT_READY');
    }
  }

  assertScope(
    scope: Pick<TrustedAuditScope, 'appId' | 'securityScope'>,
    store: string = this.binding.store,
  ): void {
    if (
      scope.appId !== this.binding.appId ||
      scope.securityScope !== this.binding.securityScope ||
      store !== this.binding.store
    ) {
      throw new AuditError('AUDIT_TRANSACTION_MISMATCH');
    }
  }

  /** Reject accessors/proxies before reading a handle, then ask its actual issuing authority. */
  validateTransaction(handle: TransactionHandle): DatabaseConnection {
    try {
      if (!handle || typeof handle !== 'object' || types.isProxy(handle))
        throw new Error('Invalid handle.');
      const descriptor = Object.getOwnPropertyDescriptor(handle, 'connection');
      if (!descriptor || !('value' in descriptor))
        throw new Error('Invalid handle.');
      const connection = descriptor.value as DatabaseConnection;
      transactionAuthority.validate(handle, connection);
      if (
        !this.owner ||
        handle.managerId !== this.owner.managerId ||
        handle.connectionId !== this.owner.connectionId
      ) {
        throw new Error('Wrong store.');
      }
      return connection;
    } catch {
      throw new AuditError('AUDIT_TRANSACTION_MISMATCH');
    }
  }

  async append(
    event: AuditEventDto,
    options: AuditRecordOptions = {},
  ): Promise<StoredAuditReceipt> {
    return this.appendWithLimits(event, options);
  }

  /** The bound recorder supplies its captured policy limit; the frozen append contract retains safe defaults. */
  async appendWithLimits(
    event: AuditEventDto,
    options: AuditRecordOptions = {},
    limits: PayloadLimits = {},
  ): Promise<StoredAuditReceipt> {
    let handle: TransactionHandle | undefined;
    try {
      if (options.transaction) {
        this.validateTransaction(options.transaction);
        handle = options.transaction;
      }
      if (!this.owner) throw new AuditError('AUDIT_NOT_READY');
      event = snapshotStoredEvent(event);
      this.assertScope(event, event.store);
      const normalized = normalizeEvent(
        {
          action: event.action,
          outcome: event.outcome,
          ...(event.target ? { target: event.target } : {}),
          ...(event.source ? { source: event.source } : {}),
          ...(event.details ? { details: event.details } : {}),
        },
        {
          scope: {
            appId: event.appId,
            securityScope: event.securityScope,
            actor: event.actor,
            initiator: event.initiator,
            roleIds: event.roleIds,
            operationId: event.operationId,
            requestId: event.requestId,
            runId: event.runId,
            correlationId: event.correlationId,
          },
          kind: event.kind,
          producer: event.producer,
          id: event.id,
          occurredAt: event.occurredAt,
          recordedAt: event.recordedAt,
          store: event.store,
          policyVersion: event.policyVersion,
        },
        limits,
      );
      if (event.eventVersion !== 1) {
        throw new AuditError('AUDIT_INVALID_EVENT');
      }
      const metadata = normalizeCollectorMetadata(
        { ...event, details: normalized.event.details },
        limits,
      );
      const safe = { ...normalized.event, ...metadata };
      const key = options.idempotencyKey;
      if (
        key !== undefined &&
        (typeof key !== 'string' ||
          key.length === 0 ||
          Buffer.byteLength(key) > 4096)
      ) {
        throw new AuditError('AUDIT_INVALID_EVENT');
      }
      const identity =
        key === undefined
          ? null
          : JSON.stringify([
              safe.appId,
              scopeEncoding(safe.securityScope),
              safe.producer,
              safe.store,
              key,
            ]);
      const row = {
        id: safe.id,
        eventHash: digest(safe.id),
        scopeIndex: digest(
          JSON.stringify([safe.appId, scopeEncoding(safe.securityScope)]),
        ),
        actorIndex: digest(
          JSON.stringify([safe.appId, safe.actor.type, safe.actor.id ?? null]),
        ),
        operationIndex:
          safe.operationId === undefined ? null : digest(safe.operationId),
        requestIndex:
          safe.requestId === undefined ? null : digest(safe.requestId),
        runIndex: safe.runId === undefined ? null : digest(safe.runId),
        eventVersion: safe.eventVersion,
        kind: safe.kind,
        producer: safe.producer,
        occurredAt: safe.occurredAt,
        recordedAt: safe.recordedAt,
        action: safe.action,
        outcome: safe.outcome,
        appId: safe.appId,
        securityScope: scopeEncoding(safe.securityScope),
        store: safe.store,
        actorType: safe.actor.type,
        actorId: safe.actor.id ?? null,
        targetResource: safe.target?.resource ?? null,
        targetKeyHash: normalized.target?.keyHash ?? null,
        targetKeyEncoding: normalized.target?.keyEncoding ?? null,
        targetDataSource: safe.target?.dataSource ?? null,
        operationId: safe.operationId ?? null,
        requestId: safe.requestId ?? null,
        runId: safe.runId ?? null,
        correlationId: safe.correlationId ?? null,
        policyVersion: safe.policyVersion,
        idempotencyHash: identity === null ? null : digest(identity),
        idempotencyScope: identity,
        fingerprint: Object.keys(metadata).length
          ? digest(JSON.stringify([normalized.fingerprint, metadata]))
          : normalized.fingerprint,
        payload: JSON.stringify(safe),
      };
      const write = async (connection: DatabaseConnection): Promise<string> => {
        const columns = Object.keys(row);
        // Infrastructure path, intentionally outside managed business Query interception.
        await auditRaw(
          connection,
          `INSERT INTO "auditEvents" (${columns.map((name) => `"${name}"`).join(',')}) VALUES (${columns.map(() => '?').join(',')}) ${connection.dialect === 'mysql' ? 'ON DUPLICATE KEY UPDATE "eventHash" = "eventHash"' : 'ON CONFLICT DO NOTHING'}`,
          Object.values(row),
        );
        const [existing] = await auditRows(
          connection,
          `SELECT "id", "fingerprint", "idempotencyScope" FROM "auditEvents" WHERE "${identity === null ? 'eventHash' : 'idempotencyHash'}" = ?${connection.dialect === 'mysql' ? ' FOR UPDATE' : ''}`,
          [identity === null ? digest(safe.id) : digest(identity)],
        );
        if (!existing) throw new AuditError('AUDIT_WRITE_FAILED');
        if (
          (identity === null && existing.id !== safe.id) ||
          existing.fingerprint !== row.fingerprint ||
          existing.idempotencyScope !== identity
        ) {
          throw new AuditError('AUDIT_IDEMPOTENCY_CONFLICT');
        }
        return storedText(existing, 'id');
      };
      if (handle) {
        const eventId = await write(handle.connection);
        return { state: 'pending-commit', eventId };
      }
      const eventId = await this.connection.transaction(write);
      return { state: 'committed', eventId };
    } catch (error) {
      if (handle && transactionAuthority.current(handle.connection) === handle)
        transactionAuthority.markRollbackOnly(handle);
      if (error instanceof AuditError) throw error;
      throw new AuditError('AUDIT_WRITE_FAILED');
    }
  }

  async findById(
    scope: TrustedAuditScope,
    id: string,
    transaction?: TransactionHandle,
  ): Promise<AuditEventDto | undefined> {
    this.assertScope(scope);
    if (!this.owner) throw new AuditError('AUDIT_NOT_READY');
    const connection = transaction
      ? this.validateTransaction(transaction)
      : this.connection;
    try {
      const [row] = await auditRows(
        connection,
        'SELECT "payload" FROM "auditEvents" WHERE "eventHash" = ? AND "id" = ? AND "appId" = ? AND "securityScope" = ? AND "store" = ?',
        [
          digest(id),
          id,
          this.binding.appId,
          scopeEncoding(this.binding.securityScope),
          this.binding.store,
        ],
      );
      return row
        ? (JSON.parse(storedText(row, 'payload')) as AuditEventDto)
        : undefined;
    } catch {
      throw new AuditError('AUDIT_WRITE_FAILED');
    }
  }
  async query(
    scope: TrustedAuditScope,
    query: AuditEventsQuery,
  ): Promise<AuditEventsPage> {
    this.assertScope(scope, query.store);
    if (!this.owner) throw new AuditError('AUDIT_NOT_READY');
    try {
      return await queryAuditStore(this.connection, scope, query);
    } catch (error) {
      if (error instanceof AuditError) throw error;
      throw new AuditError('AUDIT_WRITE_FAILED');
    }
  }

  /** Exact authorized target lookup; findById remains the Recorder's infrastructure path. */
  async queryEvent(
    scope: TrustedAuditScope,
    lookup: AuditEventLookup,
    target?: ResourceRef,
  ): Promise<AuditEventDto | undefined> {
    this.assertScope(scope, lookup.store);
    if (!this.owner) throw new AuditError('AUDIT_NOT_READY');
    if (
      typeof lookup.id !== 'string' ||
      lookup.id.length === 0 ||
      lookup.id.length > 512
    )
      throw new AuditError('AUDIT_INVALID_EVENT');
    try {
      const page = await queryAuditStore(
        this.connection,
        scope,
        { store: lookup.store, target, pageSize: 1 },
        lookup.id,
      );
      return page.items[0];
    } catch (error) {
      if (error instanceof AuditError) throw error;
      throw new AuditError('AUDIT_WRITE_FAILED');
    }
  }

  async deleteBatch(
    scope: TrustedAuditScope,
    options: {
      readonly store: string;
      readonly cutoff: string;
      readonly limit: number;
    },
  ): Promise<number> {
    this.assertScope(scope, options.store);
    if (!this.owner) throw new AuditError('AUDIT_NOT_READY');
    if (
      !Number.isSafeInteger(options.limit) ||
      options.limit < 1 ||
      options.limit > 1000 ||
      !Number.isFinite(Date.parse(options.cutoff)) ||
      new Date(options.cutoff).toISOString() !== options.cutoff
    )
      throw new AuditError('AUDIT_INVALID_EVENT');
    try {
      return await this.connection.transaction(async (connection) => {
        const rows = await auditRows(
          connection,
          'SELECT "eventHash" FROM "auditEvents" WHERE "scopeIndex" = ? AND "appId" = ? AND "securityScope" = ? AND "store" = ? AND "occurredAt" < ? ORDER BY "occurredAt", "id" LIMIT ?' +
            (connection.dialect === 'sqlite' ? '' : ' FOR UPDATE'),
          [
            digest(
              JSON.stringify([scope.appId, scopeEncoding(scope.securityScope)]),
            ),
            scope.appId,
            scopeEncoding(scope.securityScope),
            options.store,
            options.cutoff,
            options.limit,
          ],
        );
        if (rows.length === 0) return 0;
        await auditRaw(
          connection,
          `DELETE FROM "auditEvents" WHERE "eventHash" IN (${rows.map(() => '?').join(',')})`,
          rows.map((row) => storedText(row, 'eventHash')),
        );
        return rows.length;
      });
    } catch {
      throw new AuditError('AUDIT_WRITE_FAILED');
    }
  }
}

/** Backward-compatible constructor using the shared portable implementation. */
export class SqliteAuditStore extends PortableAuditStore {}
