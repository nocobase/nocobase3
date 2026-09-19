export type AuditErrorCode =
  'AUDIT_INVALID_CONTEXT' | 'AUDIT_INVALID_EVENT' | 'AUDIT_WRITE_FAILED';

/** Messages contain no event values or output backend details. */
export class AuditError extends Error {
  public constructor(
    public readonly code: AuditErrorCode,
    public readonly eventId?: string,
  ) {
    super(code);
    this.name = 'AuditError';
  }
}
