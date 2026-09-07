import { randomUUID } from 'node:crypto';
import {
  getManagedWriteRegistry,
  transactionAuthority,
  type DatabaseConnection,
  type ManagedWriteDescriptor,
  type ManagedWriteResult,
  type TransactionHandle,
} from '@nocobase/db';
import type {
  AuditSettings,
  AuditTablePolicy,
  TrustedAuditScope,
} from './contracts.js';
import type { AuditScopeCarrier } from './internal-contracts.js';
import {
  AuditCaptureCatalog,
  sameAuditTarget,
  type AuditCaptureHandle,
} from './capture-catalog.js';
import { normalizeEvent } from './event-normalizer.js';
import { AuditError } from './errors.js';
import { LocalAuditHealthService } from './health-service.js';
import { snapshotAuditScope } from './scope.js';
import { PersistentAuditSettingsService } from './settings-service.js';
import { PortableAuditStore } from './store.js';

export interface AuditDatabaseCollectorOptions {
  readonly connection: DatabaseConnection;
  readonly store: PortableAuditStore;
  /** The same fixed Store used by PersistentAuditSettingsService, including for non-default business sources. */
  readonly configurationStore: PortableAuditStore;
  readonly settings: PersistentAuditSettingsService;
  readonly scope: AuditScopeCarrier;
  readonly catalog: AuditCaptureCatalog;
  readonly health: LocalAuditHealthService;
  /** Physical targets, verified against the actual Query execution descriptor before registration is ready. */
  readonly targets: readonly AuditTablePolicy[];
}
interface Probe {
  readonly target: AuditTablePolicy;
  seen: boolean;
}
const producer = 'audit.database';
function infrastructure(table: string): boolean {
  return ['auditevents', 'auditsettings'].includes(table.toLowerCase());
}

/** One App/security boundary and physical connection. Query executes the business SQL exactly once. */
export class AuditDatabaseCollector {
  private owner:
    Pick<TransactionHandle, 'managerId' | 'connectionId'> | undefined;
  private registration: AuditCaptureHandle | undefined;
  private readonly targets: readonly AuditTablePolicy[];
  private readonly probes: WeakMap<TransactionHandle, Probe> = new WeakMap();
  private readonly pending: Set<Promise<unknown>> = new Set();
  private started = false;
  private stopping = false;
  constructor(private readonly options: AuditDatabaseCollectorOptions) {
    this.targets = Object.freeze(
      options.targets.map((target) => Object.freeze({ ...target })),
    );
    if (
      this.targets.some(
        (target) =>
          target.dataSource !== options.connection.name ||
          infrastructure(target.table) ||
          !/^[A-Za-z_][A-Za-z0-9_]*$/.test(target.table) ||
          (target.schema !== undefined &&
            !/^[A-Za-z_][A-Za-z0-9_]*$/.test(target.schema)),
      )
    )
      throw new AuditError('AUDIT_TARGET_UNSUPPORTED');
  }

  async start(): Promise<void> {
    if (this.started || this.stopping) throw new AuditError('AUDIT_NOT_READY');
    this.started = true;
    try {
      this.options.settings.assertConfigurationStore(
        this.options.configurationStore,
      );
      await this.options.store.prepare();
      await this.options.connection.transaction((connection) => {
        const handle = this.handle(connection);
        this.options.store.validateTransaction(handle);
        this.owner = {
          managerId: handle.managerId,
          connectionId: handle.connectionId,
        };
        return Promise.resolve();
      });
      const remove = getManagedWriteRegistry(this.options.connection).register(
        (descriptor, execute) => {
          const task = this.intercept(descriptor, execute);
          this.pending.add(task);
          void task
            .finally(() => this.pending.delete(task))
            .catch(() => undefined);
          return task;
        },
      );
      this.registration = this.options.catalog.register({
        producer,
        kind: 'database',
        connection: this.options.connection,
        targets: this.targets,
        dispose: remove,
      });
      await this.registration.verify(async () => {
        for (const target of this.targets) await this.verifyTarget(target);
      });
    } catch (error) {
      await this.registration?.dispose();
      this.options.health.failure(
        'AUDIT_NOT_READY',
        producer,
        this.options.connection.name,
      );
      throw error instanceof AuditError
        ? error
        : new AuditError('AUDIT_NOT_READY');
    }
  }

  /** The host must stop accepting work first; drain existing callbacks before releasing registration. */
  async dispose(): Promise<void> {
    this.stopping = true;
    await Promise.allSettled([...this.pending]);
    await this.registration?.dispose();
  }

  private async verifyTarget(target: AuditTablePolicy): Promise<void> {
    const rollback = new Error('Audit capability probe rollback.');
    const probe: Probe = { target, seen: false };
    try {
      await this.options.connection.transaction(async (connection) => {
        const handle = this.handle(connection);
        this.probes.set(handle, probe);
        try {
          await connection.query
            .deleteFrom(
              target.schema ? target.schema + '.' + target.table : target.table,
            )
            .where('__audit_probe_empty_set__', 'in', [])
            .execute();
          if (!probe.seen) throw new AuditError('AUDIT_TARGET_UNSUPPORTED');
          throw rollback;
        } finally {
          this.probes.delete(handle);
        }
      });
    } catch (error) {
      if (error !== rollback) {
        throw error;
      }
    }
    if (!probe.seen) throw new AuditError('AUDIT_NOT_READY');
  }

  private handle(connection: DatabaseConnection): TransactionHandle {
    const handle = transactionAuthority.current(connection);
    if (!handle) throw new AuditError('AUDIT_NOT_READY');
    return handle;
  }
  private scope(): TrustedAuditScope {
    const scope = snapshotAuditScope(
      this.options.scope.current() ?? {
        appId: this.options.store.binding.appId,
        securityScope: this.options.store.binding.securityScope,
        actor: { type: 'unknown' },
      },
    );
    this.options.store.assertScope(scope);
    return scope;
  }

  private async intercept<T extends ManagedWriteResult>(
    descriptor: ManagedWriteDescriptor,
    execute: (connection: DatabaseConnection) => Promise<T>,
  ): Promise<T> {
    if (
      descriptor.managerId !== this.owner?.managerId ||
      descriptor.connectionId !== this.owner.connectionId ||
      infrastructure(descriptor.target.table)
    )
      return execute(descriptor.connection);
    if (this.stopping) throw new AuditError('AUDIT_NOT_READY');
    const target: AuditTablePolicy = {
      dataSource: descriptor.connection.name,
      ...descriptor.target,
    };
    const probe = descriptor.transaction
      ? this.probes.get(descriptor.transaction)
      : undefined;
    const scope = this.scope();
    let policy: AuditSettings;
    if (probe) {
      if (!sameAuditTarget(target, probe.target))
        throw new AuditError('AUDIT_TARGET_UNSUPPORTED');
      policy = {
        revision: 0,
        enabled: true,
        observationStore: this.options.store.binding.store,
        sources: { http: 'disabled', runtime: 'disabled', database: [target] },
        retentionDays: 180,
        maxDetailsBytes: 65536,
      };
    } else {
      let configurationTransaction: TransactionHandle | undefined;
      if (descriptor.transaction) {
        try {
          this.options.configurationStore.validateTransaction(
            descriptor.transaction,
          );
          configurationTransaction = descriptor.transaction;
        } catch (error) {
          if (
            !(error instanceof AuditError) ||
            error.code !== 'AUDIT_TRANSACTION_MISMATCH'
          )
            throw error;
        }
      }
      policy = await this.options.settings.snapshot(scope, {
        transaction: configurationTransaction,
      });
    }
    if (
      !policy.enabled ||
      !policy.sources.database.some((selected) =>
        sameAuditTarget(selected, target),
      )
    )
      return execute(descriptor.connection);
    const run = async (connection: DatabaseConnection): Promise<T> => {
      const transaction = this.handle(connection);
      try {
        this.options.store.validateTransaction(transaction);
        const result = await execute(connection);
        if (probe && descriptor.summarize(result).count !== 0)
          throw new AuditError('AUDIT_NOT_READY');
        const time = new Date().toISOString();
        const event = normalizeEvent(
          {
            action: 'database.' + descriptor.operation,
            outcome: 'success',
            target: {
              dataSource: target.dataSource,
              resource: target.schema
                ? target.schema + '.' + target.table
                : target.table,
            },
          },
          {
            scope,
            kind: 'database',
            producer,
            id: randomUUID(),
            occurredAt: time,
            recordedAt: time,
            store: this.options.store.binding.store,
            policyVersion: policy.revision,
          },
        ).event;
        const receipt = await this.options.store.appendWithLimits(
          {
            ...event,
            database: {
              executionId: descriptor.executionId,
              ...descriptor.summarize(result),
            },
          },
          { transaction, idempotencyKey: descriptor.executionId },
          { maxBytes: policy.maxDetailsBytes },
        );
        if (receipt.state !== 'pending-commit')
          throw new AuditError('AUDIT_WRITE_FAILED');
        if (probe) {
          if (
            !(
              await this.options.store.findById(
                scope,
                receipt.eventId,
                transaction,
              )
            )?.database
          )
            throw new AuditError('AUDIT_NOT_READY');
          probe.seen = true;
        }
        return result;
      } catch (error) {
        transactionAuthority.markRollbackOnly(transaction);
        throw error;
      }
    };
    try {
      const result = descriptor.transaction
        ? await run(descriptor.connection)
        : await descriptor.connection.transaction(run);
      if (!descriptor.transaction && !probe)
        this.options.health.success(producer, this.options.store.binding.store);
      return result;
    } catch (error) {
      this.options.health.failure(
        error instanceof AuditError ? error.code : 'AUDIT_WRITE_FAILED',
        producer,
        this.options.store.binding.store,
      );
      throw error instanceof AuditError
        ? error
        : new AuditError('AUDIT_WRITE_FAILED');
    }
  }
}
