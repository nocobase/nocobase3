import type { AuditLogService } from '../tokens.js';

export class DefaultAuditLogService implements AuditLogService {
  public getMessage(): string {
    return 'Hello from Audit Log App Plugin';
  }
}
