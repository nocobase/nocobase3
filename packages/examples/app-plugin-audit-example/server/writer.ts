import type { AuditWriter } from '@nocobase/audit';
import { createRepositoryAuditWriter } from '@nocobase/audit/writers/repository';
import type { DatabaseManager } from '@nocobase/db';
import type { CustomerOperation } from './types.js';

export function createCustomerAuditWriter(
  database: DatabaseManager,
): AuditWriter {
  return createRepositoryAuditWriter<CustomerOperation>({
    repository: database.repository<CustomerOperation>(
      'auditExampleOperations',
    ),
    toValues: (event) => {
      if (typeof event.data.ownerId !== 'string')
        throw new Error('Customer audit requires an owner.');
      return {
        id: event.id,
        schemaVersion: event.schemaVersion,
        appName: event.appName,
        occurredAt: event.occurredAt,
        actor: event.actor,
        source: event.source,
        initiator: event.initiator ?? null,
        tenantId: event.tenantId ?? null,
        operationId: event.operationId ?? null,
        ownerId: event.data.ownerId,
        action: event.action,
        targetType: event.target?.type ?? null,
        targetId: event.target?.id ?? null,
        result: event.result,
        data: event.data,
      };
    },
  });
}
