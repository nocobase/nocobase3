import { randomUUID } from 'node:crypto';
import { AuditError } from './errors.js';
import { snapshotAuditContext, snapshotAuditInput } from './snapshot.js';
import type {
  Audit,
  AuditContext,
  AuditEvent,
  AuditInput,
  CreateAuditOptions,
} from './types.js';

export type * from './types.js';
export { AuditError, type AuditErrorCode } from './errors.js';
export { snapshotAuditContext } from './snapshot.js';

export function createAudit(options: CreateAuditOptions): Audit {
  return Object.freeze({
    async log(input: AuditInput): Promise<void> {
      const id = randomUUID();
      const occurredAt = new Date().toISOString();
      let context: AuditContext;
      try {
        context = snapshotAuditContext(options.context());
      } catch {
        throw new AuditError('AUDIT_INVALID_CONTEXT');
      }
      const event: AuditEvent = Object.freeze({
        ...context,
        ...snapshotAuditInput(input),
        id,
        occurredAt,
        schemaVersion: 1,
      });
      try {
        await options.write(event);
      } catch {
        throw new AuditError('AUDIT_WRITE_FAILED', id);
      }
    },
  });
}
