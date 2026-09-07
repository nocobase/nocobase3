import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';
import type { AuditService, AuditResourceAdapters } from './contracts.js';
export const auditServiceToken: ServiceToken<AuditService> =
  createServiceToken<AuditService>('@nocobase/app-plugin-audit/service');
export const auditResourceAdaptersToken: ServiceToken<AuditResourceAdapters> =
  createServiceToken<AuditResourceAdapters>(
    '@nocobase/app-plugin-audit/resource-adapters',
  );
