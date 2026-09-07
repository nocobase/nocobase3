export type {
  TransactionAuthority,
  ManagedWriteDescriptor,
  ManagedWriteResult,
  ManagedWriteSummary,
  ManagedWriteInterceptor,
  ManagedWriteRegistry,
} from '@nocobase/db';
import type {
  AuditCoverage,
  AuditErrorCode,
  AuditEventDto,
  AuditEventLookup,
  AuditEventsPage,
  AuditEventsQuery,
  AuditHealthDto,
  AuditHealthQuery,
  AuditOperationQuery,
  AuditReceipt,
  AuditRecordOptions,
  AuditSettings,
  AuditSettingsUpdate,
  TrustedAuditScope,
} from './contracts.js';

export interface AuditScopeCarrier {
  current(): TrustedAuditScope | undefined;
  run<T>(scope: TrustedAuditScope, callback: () => T): T;
  dispose(): void;
}
/** Opaque authorization evidence is issued and verified by QueryService's adapter. */
export interface AuditQueryAuthorization {
  readonly scope: TrustedAuditScope;
  readonly stores: readonly string[];
  readonly readDeleted: boolean;
  canRead(event: AuditEventDto): Promise<boolean>;
}
export interface AuditQueryService {
  list(
    authorization: AuditQueryAuthorization,
    query: AuditEventsQuery,
  ): Promise<AuditEventsPage>;
  detail(
    authorization: AuditQueryAuthorization,
    query: AuditEventLookup,
  ): Promise<AuditEventDto | undefined>;
  operation(
    authorization: AuditQueryAuthorization,
    query: AuditOperationQuery,
  ): Promise<AuditEventsPage>;
  count(
    authorization: AuditQueryAuthorization,
    query: AuditEventsQuery,
  ): Promise<number>;
}
export interface AuditStore {
  append(
    event: AuditEventDto,
    options?: AuditRecordOptions,
  ): Promise<Extract<AuditReceipt, { state: 'committed' | 'pending-commit' }>>;
  query(
    scope: TrustedAuditScope,
    query: AuditEventsQuery,
  ): Promise<AuditEventsPage>;
}
export interface AuditSettingsService {
  get(scope: TrustedAuditScope): Promise<AuditSettings>;
  update(
    scope: TrustedAuditScope,
    update: AuditSettingsUpdate,
  ): Promise<AuditSettings>;
}
export interface AuditHealthService {
  get(query?: AuditHealthQuery): AuditHealthDto;
  report(coverage: AuditCoverage): void;
  failure(code: AuditErrorCode, producer: string, store: string): void;
}
