import { randomUUID } from 'node:crypto';
import { transactionAuthority } from '@nocobase/db';
import type {
  AuditEventInput,
  AuditRecorder,
  AuditRecordOptions,
  AuditReceipt,
  TrustedAuditScope,
} from './contracts.js';
import { normalizeEvent } from './event-normalizer.js';
import { AuditError } from './errors.js';
import type { PortableAuditStore } from './store.js';

export interface AuditRecorderPolicy {
  readonly revision: number;
  readonly enabled: boolean;
  readonly excluded?: boolean;
  readonly maxDetailsBytes: number;
}
export interface BoundAuditRecorderOptions {
  readonly producer: string;
  readonly store: PortableAuditStore;
  /** A snapshot supplied by the owning Settings integration, not another settings database. */
  readonly policy: () => Promise<AuditRecorderPolicy>;
}

/** Explicit trusted server binding. HTTP/database collectors and full service assembly are separate. */
export function bindAuditRecorder(
  scope: TrustedAuditScope,
  options: BoundAuditRecorderOptions,
): AuditRecorder {
  const store = options.store;
  store.assertScope(scope);
  const seed = normalizeEvent(
    { action: 'audit.bind', outcome: 'unknown' },
    {
      scope,
      kind: 'business',
      producer: options.producer,
      store: store.binding.store,
      id: randomUUID(),
      occurredAt: new Date().toISOString(),
      recordedAt: new Date().toISOString(),
      policyVersion: 0,
    },
  ).event;
  const boundScope: TrustedAuditScope = {
    appId: seed.appId,
    securityScope: seed.securityScope,
    actor: seed.actor,
    initiator: seed.initiator,
    roleIds: seed.roleIds,
    operationId: seed.operationId,
    requestId: seed.requestId,
    runId: seed.runId,
    correlationId: seed.correlationId,
  };
  const getPolicy = options.policy;
  return {
    async record(
      event: AuditEventInput,
      recordOptions: AuditRecordOptions = {},
    ): Promise<AuditReceipt> {
      const transaction = recordOptions.transaction;
      const idempotencyKey = recordOptions.idempotencyKey;
      let active = false;
      try {
        if (transaction) {
          store.validateTransaction(transaction);
          active = true;
        }
        const policy = { ...(await getPolicy()) };
        if (transaction) store.validateTransaction(transaction);
        if (
          !Number.isSafeInteger(policy.revision) ||
          policy.revision < 0 ||
          typeof policy.enabled !== 'boolean' ||
          (policy.excluded !== undefined &&
            typeof policy.excluded !== 'boolean') ||
          !Number.isSafeInteger(policy.maxDetailsBytes) ||
          policy.maxDetailsBytes < 1
        )
          throw new AuditError('AUDIT_NOT_READY');
        if (!policy.enabled)
          return { state: 'disabled', reason: 'audit-disabled' };
        if (policy.excluded)
          return {
            state: 'excluded',
            reason: 'producer-excluded',
            policyVersion: policy.revision,
          };
        const time = new Date().toISOString();
        const normalized = normalizeEvent(
          event,
          {
            scope: boundScope,
            kind: 'business',
            producer: seed.producer,
            store: store.binding.store,
            id: randomUUID(),
            occurredAt: time,
            recordedAt: time,
            policyVersion: policy.revision,
          },
          { maxBytes: policy.maxDetailsBytes },
        );
        return await store.appendWithLimits(
          normalized.event,
          { transaction, idempotencyKey },
          { maxBytes: policy.maxDetailsBytes },
        );
      } catch (error) {
        if (
          active &&
          transaction &&
          transactionAuthority.current(transaction.connection) === transaction
        )
          transactionAuthority.markRollbackOnly(transaction);
        if (error instanceof AuditError) throw error;
        throw new AuditError('AUDIT_WRITE_FAILED');
      }
    },
  };
}
