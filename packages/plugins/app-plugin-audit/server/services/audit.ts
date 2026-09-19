import {
  createAudit,
  snapshotAuditContext,
  type Audit,
  type AuditWriter,
} from '@nocobase/audit';
import type { AppAudit, AppAuditContext } from '../tokens.js';

export function createAppAudit(appName: string, writer: AuditWriter): AppAudit {
  return Object.freeze({
    for(input: AppAuditContext): Audit {
      const context = snapshotAuditContext({ ...input, appName });
      return createAudit({
        context: () => context,
        write: (event) => writer.write(event),
      });
    },
  });
}
