import type {
  AuditRecorder,
  AuditReceipt,
} from '@nocobase/app-plugin-audit/server';

// The trusted host supplies a recorder bound to authenticated or verified job identity.
// Record the confirmed domain phase; never accept actor/initiator from event input.
export async function recordValidation(
  recorder: AuditRecorder,
): Promise<AuditReceipt> {
  return recorder.record({
    action: 'audit-example.validation-completed',
    outcome: 'success',
    details: { validation: 'approved-format' },
  });
}
