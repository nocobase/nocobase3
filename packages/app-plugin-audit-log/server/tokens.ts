import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

export interface AuditLogService {
  getMessage(): string;
}

export const auditLogServiceToken: ServiceToken<AuditLogService> =
  createServiceToken<AuditLogService>('@nocobase/app-plugin-audit-log/service');
