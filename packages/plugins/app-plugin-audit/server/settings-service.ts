import { createHash } from 'node:crypto';
import {
  transactionAuthority,
  type DatabaseConnection,
  type TransactionHandle,
} from '@nocobase/db';
import type {
  AuditSettings,
  AuditDeploymentRequirements,
  AuditSettingsUpdate,
  TrustedAuditScope,
} from './contracts.js';
import type { AuditSettingsService } from './internal-contracts.js';
import { auditRaw, auditRows, storedText } from './database/sql-client.js';
import { AuditError } from './errors.js';
import { LocalAuditHealthService } from './health-service.js';
import { AuditReadiness } from './providers/readiness.js';
import { bindAuditRecorder, type AuditRecorderPolicy } from './service.js';
import {
  snapshotAuditSettings,
  snapshotAuditSettingsUpdate,
} from './settings-validation.js';
import { assertAuditStoreConnection } from './store-connection-check.js';
import { PortableAuditStore } from './store.js';

export interface AuditSettingsReadOptions {
  /** Explicit active transaction belonging to the configuration Store, never a different business Store. */
  readonly transaction?: TransactionHandle;
}

export interface PersistentAuditSettingsOptions {
  readonly connection: DatabaseConnection;
  readonly store: PortableAuditStore;
  readonly readiness: AuditReadiness;
  readonly health: LocalAuditHealthService;
  readonly defaults?: Partial<Omit<AuditSettings, 'revision'>>;
}

/** One instance owns one trusted App/security boundary; the table is the only policy authority. */
export class PersistentAuditSettingsService implements AuditSettingsService {
  get requirements(): AuditDeploymentRequirements {
    return this.options.readiness.requirements;
  }
  private readonly defaults: AuditSettings;
  // A successful infrastructure check must precede transaction reads; checking the
  // root pool from inside its own SQLite transaction would wait for itself.
  private transactionReadsReady = false;
  private readonly listeners: Set<(settings: AuditSettings) => void> =
    new Set();
  private readonly scopeHash: string;
  private readonly scopeEncoding: string;
  constructor(private readonly options: PersistentAuditSettingsOptions) {
    this.scopeEncoding = JSON.stringify(
      options.store.binding.securityScope === undefined
        ? ['absent']
        : ['value', options.store.binding.securityScope],
    );
    this.scopeHash = createHash('sha256')
      .update(JSON.stringify([options.store.binding.appId, this.scopeEncoding]))
      .digest('hex');
    this.defaults = snapshotAuditSettings({
      enabled: false,
      observationStore: options.store.binding.store,
      sources: { http: 'disabled', runtime: 'disabled', database: [] },
      retentionDays: 180,
      maxDetailsBytes: 65536,
      ...options.defaults,
      revision: 1,
    });
    if (options.connection.name !== options.store.binding.store)
      throw new AuditError('AUDIT_TRANSACTION_MISMATCH');
  }

  /** Trusted composition must supply the exact configuration Store before choosing transaction reads. */
  assertConfigurationStore(store: PortableAuditStore): void {
    if (this.options.store !== store)
      throw new AuditError('AUDIT_TRANSACTION_MISMATCH');
  }

  /** Called once after explicit migration/Store preparation. Conflict never overwrites persisted values. */
  async initialize(scope: TrustedAuditScope): Promise<AuditSettings> {
    this.options.store.assertScope(scope);
    try {
      const connection = this.options.connection;
      await assertAuditStoreConnection(connection, this.options.store);
      this.transactionReadsReady = true;
      await auditRaw(
        connection,
        'INSERT INTO "auditSettings" ("scopeHash", "appId", "securityScope", "revision", "settings") VALUES (?, ?, ?, ?, ?) ' +
          (connection.dialect === 'mysql'
            ? 'ON DUPLICATE KEY UPDATE "scopeHash" = "scopeHash"'
            : 'ON CONFLICT DO NOTHING'),
        [
          this.scopeHash,
          scope.appId,
          this.scopeEncoding,
          1,
          JSON.stringify(this.defaults),
        ],
      );
      return await this.get(scope);
    } catch (error) {
      return this.failed(error);
    }
  }

  async get(
    scope: TrustedAuditScope,
    options: AuditSettingsReadOptions = {},
  ): Promise<AuditSettings> {
    this.options.store.assertScope(scope);
    try {
      if (options.transaction !== undefined) {
        const connection = this.options.store.validateTransaction(
          options.transaction,
        );
        if (!this.transactionReadsReady)
          throw new AuditError('AUDIT_NOT_READY');
        return await this.read(connection);
      }
      await assertAuditStoreConnection(
        this.options.connection,
        this.options.store,
      );
      this.transactionReadsReady = true;
      return await this.read(this.options.connection);
    } catch (error) {
      return this.failed(error);
    }
  }

  private async read(connection: DatabaseConnection): Promise<AuditSettings> {
    const [row] = await auditRows(
      connection,
      'SELECT "appId", "securityScope", "revision", "settings" FROM "auditSettings" WHERE "scopeHash" = ?',
      [this.scopeHash],
    );
    if (!row) throw new AuditError('AUDIT_NOT_READY');
    if (
      row.appId !== this.options.store.binding.appId ||
      row.securityScope !== this.scopeEncoding
    )
      throw new AuditError('AUDIT_TRANSACTION_MISMATCH');
    const settings = snapshotAuditSettings(
      JSON.parse(storedText(row, 'settings')) as unknown,
    );
    if (settings.revision !== Number(row.revision))
      throw new AuditError('AUDIT_NOT_READY');
    return settings;
  }

  /** Execution entry obtains one immutable policy; it must retain it through completion. */
  async snapshot(
    scope: TrustedAuditScope,
    options: AuditSettingsReadOptions = {},
  ): Promise<AuditSettings> {
    const settings = await this.get(scope, options);
    // A transaction may see uncommitted policy data. Validate it without publishing
    // that candidate as the instance's committed health/configuration state.
    const enabled = this.options.readiness.effective(
      settings,
      options.transaction !== undefined,
    );
    return enabled === settings.enabled
      ? settings
      : Object.freeze({ ...settings, enabled });
  }

  async recorderPolicy(
    scope: TrustedAuditScope,
    options: AuditSettingsReadOptions = {},
  ): Promise<AuditRecorderPolicy> {
    const settings = await this.snapshot(scope, options);
    return Object.freeze({
      revision: settings.revision,
      enabled: settings.enabled,
      excluded: settings.sources.runtime === 'disabled',
      maxDetailsBytes: settings.maxDetailsBytes,
    });
  }

  async update(
    scope: TrustedAuditScope,
    update: AuditSettingsUpdate,
  ): Promise<AuditSettings> {
    this.options.store.assertScope(scope);
    update = snapshotAuditSettingsUpdate(update);
    if (
      !Number.isSafeInteger(update.expectedRevision) ||
      update.expectedRevision < 1 ||
      typeof update.confirmRetentionReduction !== 'boolean'
    )
      throw new AuditError('AUDIT_POLICY_CONFLICT');
    const next = snapshotAuditSettings({
      ...update.settings,
      revision: update.expectedRevision + 1,
    });
    const previous = await this.get(scope);
    if (previous.revision !== update.expectedRevision)
      throw new AuditError('AUDIT_POLICY_CONFLICT');
    this.options.readiness.validate(next, previous);
    if (
      next.retentionDays !== null &&
      (previous.retentionDays === null ||
        next.retentionDays < previous.retentionDays) &&
      !update.confirmRetentionReduction
    )
      throw new AuditError('AUDIT_POLICY_CONFLICT');
    if (next.enabled) {
      await this.options.readiness.probe(next);
      this.options.readiness.effective(next, true);
    }
    try {
      await this.options.connection.transaction(async (connection) => {
        const sql =
          'UPDATE "auditSettings" SET "revision" = ?, "settings" = ? WHERE "scopeHash" = ? AND "revision" = ?';
        const bindings = [
          next.revision,
          JSON.stringify(next),
          this.scopeHash,
          update.expectedRevision,
        ];
        let changed: boolean;
        if (connection.dialect === 'mysql') {
          const result = await auditRaw(connection, sql, bindings);
          const header: unknown = Array.isArray(result) ? result[0] : undefined;
          changed =
            !!header &&
            typeof header === 'object' &&
            'affectedRows' in header &&
            header.affectedRows === 1;
        } else
          changed =
            (
              await auditRows(
                connection,
                sql + ' RETURNING "revision"',
                bindings,
              )
            ).length === 1;
        if (!changed) throw new AuditError('AUDIT_POLICY_CONFLICT');
        // Recheck after asynchronous I/O: disappearing required capabilities roll back the CAS.
        if (next.enabled) this.options.readiness.effective(next, true);
        const transaction = transactionAuthority.current(connection);
        if (!transaction) throw new AuditError('AUDIT_NOT_READY');
        const recorder = bindAuditRecorder(scope, {
          producer: 'audit.settings',
          store: this.options.store,
          policy: () =>
            Promise.resolve({
              revision: next.revision,
              enabled: true,
              maxDetailsBytes: next.maxDetailsBytes,
            }),
        });
        await recorder.record(
          {
            action: 'audit.settings.update',
            outcome: 'success',
            details: {
              previousRevision: previous.revision,
              revision: next.revision,
            },
          },
          { transaction },
        );
      });
    } catch (error) {
      return this.failed(error);
    }
    // Publish only after CAS and the audit fact commit. A concurrent collector failure is
    // observable health degradation, never a claim that the transaction did not commit.
    try {
      this.options.readiness.effective(next);
    } catch {
      this.options.health.failure(
        'AUDIT_NOT_READY',
        'audit.settings',
        this.options.connection.name,
      );
    }
    // Subscribers are notifications, never the enforcement source. Persisted CAS is already committed.
    for (const listener of this.listeners) {
      try {
        listener(next);
      } catch {
        this.options.health.failure(
          'AUDIT_NOT_READY',
          'audit.settings.listener',
          this.options.connection.name,
        );
      }
    }
    return next;
  }

  subscribe(listener: (settings: AuditSettings) => void): () => void {
    this.listeners.add(listener);
    return (): void => {
      this.listeners.delete(listener);
    };
  }

  private failed(error: unknown): never {
    if (
      error instanceof AuditError &&
      (error.code === 'AUDIT_POLICY_CONFLICT' ||
        error.code === 'AUDIT_TRANSACTION_MISMATCH')
    )
      throw error;
    const code =
      error instanceof AuditError ? error.code : 'AUDIT_WRITE_FAILED';
    this.options.health.failure(
      code,
      'audit.settings',
      this.options.connection.name,
    );
    throw new AuditError(code);
  }
}
