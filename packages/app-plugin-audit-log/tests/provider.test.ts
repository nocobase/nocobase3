import { ServiceContainer } from '@nocobase/service-provider';
import { describe, expect, it } from 'vitest';

import { AuditLogProvider } from '../server/providers/audit-log.js';
import { DefaultAuditLogService } from '../server/services/audit-log.js';
import { auditLogServiceToken } from '../server/tokens.js';

describe('@nocobase/app-plugin-audit-log', () => {
  it('registers its service as a lazy singleton', () => {
    const container = new ServiceContainer();
    const provider = new AuditLogProvider({ container });

    expect(provider.name).toBe('@nocobase/app-plugin-audit-log');
    expect(container.resolveIfCreated(auditLogServiceToken)).toBeUndefined();

    provider.register();

    const service = container.resolve(auditLogServiceToken);
    expect(service).toBeInstanceOf(DefaultAuditLogService);
    expect(service.getMessage()).toBe('Hello from Audit Log App Plugin');
    expect(container.resolve(auditLogServiceToken)).toBe(service);
  });
});
