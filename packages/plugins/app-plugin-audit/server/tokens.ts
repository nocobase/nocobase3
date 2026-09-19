import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';
import type { Audit, AuditContext, AuditWriter } from '@nocobase/audit';
import type { ServiceResolver } from '@nocobase/service-provider';

export type AppAuditContext = Omit<AuditContext, 'appName'>;
export interface AppAudit {
  for(context: AppAuditContext): Audit;
}
export interface AuditWriterBinding {
  readonly writer: AuditWriter;
  /** Releases only resources created by this binding, after pending writes. */
  readonly dispose?: () => void | Promise<void>;
}
export interface AuditConfig {
  readonly createWriter: (
    services: ServiceResolver,
  ) => AuditWriterBinding | Promise<AuditWriterBinding>;
}
export const auditServiceToken: ServiceToken<AppAudit> =
  createServiceToken<AppAudit>('@nocobase/app-plugin-audit/service');
