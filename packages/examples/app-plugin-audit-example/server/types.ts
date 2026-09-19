import type { AuditActor, AuditData, AuditSource } from '@nocobase/audit';

export interface Customer {
  id: string;
  ownerId: string;
  name: string;
  phone: string;
  version: number;
}
export interface CustomerInput {
  name: string;
  phone: string;
}
export interface CustomerUpdate extends CustomerInput {
  id: string;
  version: number;
}
export interface CustomerDelete {
  id: string;
  version: number;
}
export interface CustomerOperation {
  id: string;
  schemaVersion: number;
  appName: string;
  ownerId: string;
  occurredAt: string;
  actor: AuditActor;
  source: AuditSource;
  initiator: AuditActor | null;
  operationId: string | null;
  tenantId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  result: string;
  data: AuditData;
}
