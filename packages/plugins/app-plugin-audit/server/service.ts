import { randomUUID } from 'node:crypto';
import { transactionAuthority } from '@nocobase/db';
import type {
  AuditEventInput,
  AuditRecorder,
  AuditRecordOptions,
  AuditReceipt,
  TrustedAuditScope,
} from './contracts.js';
import {
  normalizeAuditIdentifier,
  normalizeEvent,
  snapshotAuditScope,
} from './event-normalizer.js';
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
  const boundScope = snapshotAuditScope(scope);
  store.assertScope(boundScope);
  const producer = normalizeAuditIdentifier(options.producer);
  normalizeAuditIdentifier(store.binding.store);
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
            producer,
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
