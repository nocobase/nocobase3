import type {
  AuditEventInput,
  AuditReceipt,
  AuditRecorder,
  AuditRecordOptions,
} from './contracts.js';
/** An explicit opt-out, never a fallback for a missing or failing store. */
export class DisabledAuditRecorder implements AuditRecorder {
  public constructor(private readonly reason: string) {
    if (!reason.trim())
      throw new Error('An explicit disabled reason is required.');
  }
  public record(
    _event: AuditEventInput,
    _options?: AuditRecordOptions,
  ): Promise<AuditReceipt> {
    return Promise.resolve(
      Object.freeze({ state: 'disabled', reason: this.reason }),
    );
  }
}
