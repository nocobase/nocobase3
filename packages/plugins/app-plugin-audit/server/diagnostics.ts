import {
  AuditError,
  type Audit,
  type AuditErrorCode,
  type AuditInput,
} from '@nocobase/audit';

export interface AuditFailureDiagnostic {
  readonly code: AuditErrorCode | 'AUDIT_UNEXPECTED_FAILURE';
  readonly eventId?: string;
}
export type AuditFailureReporter = (
  diagnostic: AuditFailureDiagnostic,
) => void | Promise<void>;

/** Use only after the business result is confirmed. Never retries business work. */
export async function logAuditBestEffort(
  audit: Audit,
  input: AuditInput,
  report: AuditFailureReporter,
): Promise<void> {
  try {
    await audit.log(input);
  } catch (error) {
    const diagnostic: AuditFailureDiagnostic =
      error instanceof AuditError
        ? Object.freeze({
            code: error.code,
            ...(error.eventId === undefined ? {} : { eventId: error.eventId }),
          })
        : Object.freeze({ code: 'AUDIT_UNEXPECTED_FAILURE' });
    try {
      await report(diagnostic);
    } catch {
      // Diagnostics must not turn committed work into a retryable failure.
    }
  }
}
