import { createHash, randomUUID } from 'node:crypto';
import { transactionAuthority, type DatabaseConnection } from '@nocobase/db';
import type { DatabaseManager } from '@nocobase/db';
import type { AuditSettings, TrustedAuditScope } from './contracts.js';
import { auditRaw, auditRows, storedText } from './database/sql-client.js';
import { AuditError } from './errors.js';
import { LocalAuditHealthService } from './health-service.js';
import { bindAuditRecorder } from './service.js';
import { PersistentAuditSettingsService } from './settings-service.js';
import { assertAuditStoreConnection } from './store-connection-check.js';
import { PortableAuditStore, type AuditStoreBinding } from './store.js';

export interface AuditRetentionOptions {
  readonly connection: DatabaseConnection;
  readonly store: PortableAuditStore;
  readonly configurationStore: PortableAuditStore;
  readonly settings: PersistentAuditSettingsService;
  readonly health: LocalAuditHealthService;
  readonly batchSize?: number;
  readonly maxBatches?: number;
}
export interface AuditRetentionPlan {
  readonly referenceTime: string;
  readonly expectedRevision: number;
}
export interface AuditCleanupResult {
  readonly attemptId: string;
  readonly status:
    'completed' | 'bounded' | 'disabled' | 'no-auto-delete' | 'stopped';
  readonly cutoff: string | null;
  readonly revision: number;
  /** Only committed deletions in this invocation, never a cumulative retry count. */
  readonly deleted: number;
  readonly batches: number;
}
export interface AuditRetentionObservation {
  readonly state:
    | 'not-run'
    | 'running'
    | 'completed'
    | 'bounded'
    | 'disabled'
    | 'no-auto-delete'
    | 'stopped'
    | 'failed';
  readonly lastRun?: AuditCleanupResult;
}
interface Cursor {
  readonly occurredAt: string;
  readonly id: string;
}
const producer = 'audit.retention';

/** Trusted App composition owns the boundary. Neither queue payloads nor HTTP choose it. */
export class AuditRetentionService {
  private readonly scope: TrustedAuditScope;
  private readonly batchSize: number;
  private readonly maxBatches: number;
  private accepting = true;
  private readonly pending: Set<Promise<AuditCleanupResult>> = new Set();
  private observation: AuditRetentionObservation = { state: 'not-run' };

  constructor(private readonly options: AuditRetentionOptions) {
    options.settings.assertConfigurationStore(options.configurationStore);
    options.configurationStore.assertScope(options.store.binding);
    this.scope = Object.freeze({
      appId: options.store.binding.appId,
      securityScope: options.store.binding.securityScope,
      actor: Object.freeze({ type: 'system' }),
    });
    this.batchSize = options.batchSize ?? 200;
    this.maxBatches = options.maxBatches ?? 100;
    if (
      !Number.isSafeInteger(this.batchSize) ||
      this.batchSize < 1 ||
      this.batchSize > 1000 ||
      !Number.isSafeInteger(this.maxBatches) ||
      this.maxBatches < 1 ||
      this.maxBatches > 1000
    )
      throw new AuditError('AUDIT_INVALID_EVENT');
  }

  assertJobBinding(binding: AuditStoreBinding): void {
    this.options.store.assertScope(binding, binding.store);
  }

  assertJobDatabase(database: DatabaseManager): void {
    if (
      database.connection(this.options.store.binding.store) !==
      this.options.connection
    )
      throw new AuditError('AUDIT_TRANSACTION_MISMATCH');
  }

  observe(): AuditRetentionObservation {
    return structuredClone(this.observation);
  }

  async plan(): Promise<AuditRetentionPlan | undefined> {
    if (!this.accepting) throw new AuditError('AUDIT_NOT_READY');
    const policy = await this.options.settings.get(this.scope);
    if (!policy.enabled || policy.retentionDays === null) {
      this.observation = {
        ...this.observation,
        state: !policy.enabled ? 'disabled' : 'no-auto-delete',
      };
      const previous = this.options.health
        .get()
        .coverage.find(
          (entry) =>
            entry.producer === producer &&
            entry.store === this.options.store.binding.store,
        );
      this.options.health.report({
        ...previous,
        producer,
        store: this.options.store.binding.store,
        configured: false,
        registered: this.accepting,
        observed: previous?.observed ?? false,
      });
      return undefined;
    }
    return Object.freeze({
      referenceTime: new Date(Date.now()).toISOString(),
      expectedRevision: policy.revision,
    });
  }

  run(plan?: AuditRetentionPlan): Promise<AuditCleanupResult> {
    if (!this.accepting)
      return Promise.reject(new AuditError('AUDIT_NOT_READY'));
    const task = this.execute(plan);
    this.pending.add(task);
    void task.then(
      () => this.pending.delete(task),
      () => this.pending.delete(task),
    );
    return task;
  }

  stopAccepting(): void {
    this.accepting = false;
    const previous = this.options.health
      .get()
      .coverage.find(
        (entry) =>
          entry.producer === producer &&
          entry.store === this.options.store.binding.store,
      );
    if (previous)
      this.options.health.report({ ...previous, registered: false });
  }
  async drain(): Promise<void> {
    await Promise.allSettled([...this.pending]);
  }
  async dispose(): Promise<void> {
    this.stopAccepting();
    await this.drain();
  }

  private async execute(
    plan?: AuditRetentionPlan,
  ): Promise<AuditCleanupResult> {
    const { connection, store, settings, health } = this.options;
    const attemptId = randomUUID();
    this.observation = { ...this.observation, state: 'running' };
    try {
      // Physical identity is checked before entering a root-pool transaction.
      await assertAuditStoreConnection(connection, store);
      const policy = await settings.get(this.scope);
      const referenceTime =
        plan === undefined ? Date.now() : Date.parse(plan.referenceTime);
      if (
        !Number.isFinite(referenceTime) ||
        referenceTime > Date.now() ||
        (plan !== undefined &&
          (new Date(referenceTime).toISOString() !== plan.referenceTime ||
            plan.expectedRevision !== policy.revision))
      )
        throw new AuditError('AUDIT_POLICY_CONFLICT');
      const previous = health
        .get()
        .coverage.find(
          (entry) =>
            entry.producer === producer && entry.store === store.binding.store,
        );
      health.report({
        ...previous,
        producer,
        store: store.binding.store,
        configured: policy.enabled && policy.retentionDays !== null,
        registered: this.accepting,
        observed: previous?.observed ?? false,
      });
      const cutoff =
        policy.retentionDays === null
          ? null
          : new Date(
              referenceTime - policy.retentionDays * 86400000,
            ).toISOString();
      let result: AuditCleanupResult = {
        attemptId,
        status: !policy.enabled
          ? 'disabled'
          : cutoff === null
            ? 'no-auto-delete'
            : 'completed',
        cutoff,
        revision: policy.revision,
        deleted: 0,
        batches: 0,
      };
      let cursor: Cursor | undefined;
      if (policy.enabled && cutoff !== null) {
        for (let index = 0; index < this.maxBatches; index++) {
          if (!this.accepting) {
            result = { ...result, status: 'stopped' };
            break;
          }
          // Observe committed policy changes between batches, including cross-process disablement.
          const current = await settings.get(this.scope);
          if (!current.enabled) {
            result = { ...result, status: 'disabled' };
            break;
          }
          if (current.revision !== policy.revision)
            throw new AuditError('AUDIT_POLICY_CONFLICT');
          const batch = await this.batch(
            policy,
            cutoff,
            cursor,
            attemptId,
            index,
          );
          result = {
            ...result,
            deleted: result.deleted + batch.count,
            batches: result.batches + 1,
          };
          if (!batch.cursor || batch.count < this.batchSize) break;
          cursor = batch.cursor;
          if (index + 1 === this.maxBatches)
            result = { ...result, status: 'bounded' };
        }
      }
      // A final summary is required even for an empty or intentionally disabled run.
      await this.summary(policy, result);
      this.observation = { state: result.status, lastRun: result };
      health.success(producer, store.binding.store);
      return result;
    } catch (error) {
      this.observation = { ...this.observation, state: 'failed' };
      const code =
        error instanceof AuditError ? error.code : 'AUDIT_WRITE_FAILED';
      health.failure(code, producer, store.binding.store);
      throw new AuditError(code);
    }
  }

  private async batch(
    policy: AuditSettings,
    cutoff: string,
    cursor: Cursor | undefined,
    attemptId: string,
    index: number,
  ): Promise<{ count: number; cursor?: Cursor }> {
    const {
      connection: root,
      store,
      configurationStore,
      settings,
    } = this.options;
    return root.transaction(async (connection) => {
      const transaction = transactionAuthority.current(connection);
      if (!transaction) throw new AuditError('AUDIT_NOT_READY');
      store.validateTransaction(transaction);
      if (store === configurationStore) {
        const current = await settings.get(this.scope, { transaction });
        if (!current.enabled || current.revision !== policy.revision)
          throw new AuditError('AUDIT_POLICY_CONFLICT');
      }
      const scopeEncoding = JSON.stringify(
        this.scope.securityScope === undefined
          ? ['absent']
          : ['value', this.scope.securityScope],
      );
      const scopeIndex = createHash('sha256')
        .update(JSON.stringify([this.scope.appId, scopeEncoding]))
        .digest('hex');
      const where =
        '"scopeIndex" = ? AND "appId" = ? AND "securityScope" = ? AND "store" = ? AND "occurredAt" < ?';
      const bindings: unknown[] = [
        scopeIndex,
        this.scope.appId,
        scopeEncoding,
        store.binding.store,
        cutoff,
      ];
      const idExpression =
        connection.dialect === 'mysql'
          ? 'BINARY "id"'
          : connection.dialect === 'postgres'
            ? '"id" COLLATE "C"'
            : '"id" COLLATE BINARY';
      const cursorSql = cursor
        ? ' AND ("occurredAt" > ? OR ("occurredAt" = ? AND ' +
          idExpression +
          ' > ?))'
        : '';
      if (cursor)
        bindings.push(cursor.occurredAt, cursor.occurredAt, cursor.id);
      const rows = await auditRows(
        connection,
        'SELECT "eventHash", "occurredAt", "id" FROM "auditEvents" WHERE ' +
          where +
          cursorSql +
          ' ORDER BY "occurredAt", ' +
          idExpression +
          ' LIMIT ?' +
          (connection.dialect === 'sqlite' ? '' : ' FOR UPDATE'),
        [...bindings, this.batchSize],
      );
      if (!rows.length) return { count: 0 };
      await auditRaw(
        connection,
        'DELETE FROM "auditEvents" WHERE ' +
          where +
          ' AND "eventHash" IN (' +
          rows.map(() => '?').join(',') +
          ')',
        [
          scopeIndex,
          this.scope.appId,
          scopeEncoding,
          store.binding.store,
          cutoff,
          ...rows.map((row) => storedText(row, 'eventHash')),
        ],
      );
      const recorder = this.recorder(policy, attemptId);
      await recorder.record(
        {
          action: 'audit.cleanup.batch',
          outcome: 'success',
          details: {
            deleted: rows.length,
            cutoff,
            revision: policy.revision,
            batch: index,
          },
        },
        { transaction },
      );
      const last = rows[rows.length - 1];
      return {
        count: rows.length,
        cursor: {
          occurredAt: storedText(last, 'occurredAt'),
          id: storedText(last, 'id'),
        },
      };
    });
  }

  private recorder(
    policy: AuditSettings,
    attemptId: string,
  ): ReturnType<typeof bindAuditRecorder> {
    return bindAuditRecorder(
      { ...this.scope, runId: attemptId },
      {
        producer,
        store: this.options.store,
        policy: () =>
          Promise.resolve({
            enabled: true,
            revision: policy.revision,
            maxDetailsBytes: 65536,
          }),
      },
    );
  }
  private async summary(
    policy: AuditSettings,
    result: AuditCleanupResult,
  ): Promise<void> {
    await this.recorder(policy, result.attemptId).record({
      action: 'audit.cleanup',
      outcome: 'success',
      details: {
        deleted: result.deleted,
        batches: result.batches,
        cutoff: result.cutoff,
        revision: result.revision,
        status: result.status,
        countSemantics: 'committed-in-this-attempt',
      },
    });
  }
}
