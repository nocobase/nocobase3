export type AuditJson =
  null | boolean | number | string | readonly AuditJson[] | AuditData;
export interface AuditData {
  readonly [key: string]: AuditJson;
}
export interface AuditActor {
  readonly type: string;
  readonly id: string;
}
export interface AuditSource extends AuditData {
  readonly type: string;
}
export interface AuditContext {
  readonly appName: string;
  readonly actor: AuditActor;
  readonly source: AuditSource;
  readonly tenantId?: string;
  readonly initiator?: AuditActor;
  readonly operationId?: string;
}
export interface AuditTarget {
  readonly type: string;
  readonly id: string;
}
export interface AuditInput {
  readonly action: string;
  readonly target?: AuditTarget;
  readonly result: 'success' | 'denied' | 'failure';
  readonly data?: AuditData;
}
export interface AuditEvent extends AuditContext, AuditInput {
  readonly id: string;
  readonly schemaVersion: 1;
  readonly occurredAt: string;
  readonly data: AuditData;
}
export interface Audit {
  log(input: AuditInput): Promise<void>;
}
export interface AuditWriter {
  write(event: AuditEvent): Promise<void>;
}
export interface CreateAuditOptions {
  context(): AuditContext;
  write(event: AuditEvent): Promise<void>;
}
