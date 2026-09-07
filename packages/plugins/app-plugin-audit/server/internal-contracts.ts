import type { TransactionAuthority } from '@nocobase/db';
export type {
  TransactionAuthority,
  ManagedWriteDescriptor,
  ManagedWriteResult,
  ManagedWriteSummary,
  ManagedWriteInterceptor,
  ManagedWriteRegistry,
} from '@nocobase/db';
import type { Context } from 'hono';
import type {
  AuditCoverage,
  AuditDeploymentRequirements,
  AuditErrorCode,
  AuditEventDto,
  AuditEventLookup,
  AuditEventsPage,
  AuditEventsQuery,
  AuditHealthDto,
  AuditHealthQuery,
  AuditHttpResult,
  AuditOperationQuery,
  AuditReceipt,
  AuditRecordOptions,
  AuditService,
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
  deleteBatch(
    scope: TrustedAuditScope,
    options: {
      readonly store: string;
      readonly cutoff: string;
      readonly limit: number;
    },
  ): Promise<number>;
}
export interface AuditSettingsService {
  get(scope: TrustedAuditScope): Promise<AuditSettings>;
  update(
    scope: TrustedAuditScope,
    update: AuditSettingsUpdate,
  ): Promise<AuditSettings>;
  subscribe(listener: (settings: AuditSettings) => void): () => void;
}
export interface AuditHealthService {
  get(query?: AuditHealthQuery): AuditHealthDto;
  report(coverage: AuditCoverage): void;
  failure(code: AuditErrorCode, producer: string, store: string): void;
}
export interface AuditProducerBinding {
  readonly producer: string;
  readonly service: AuditService;
  readonly scope: AuditScopeCarrier;
}
export type AuditDispose = () => void | Promise<void>;
export interface AuditProducerAdapter {
  readonly name: string;
  register(binding: AuditProducerBinding): AuditDispose | Promise<AuditDispose>;
}
export interface AuditAssembly {
  readonly store: AuditStore;
  readonly settings: AuditSettingsService;
  readonly health: AuditHealthService;
  readonly scope: AuditScopeCarrier;
  readonly transactions: TransactionAuthority;
  readonly requirements: AuditDeploymentRequirements;
  readonly producers: readonly AuditProducerAdapter[];
}
/** G09 installs this at the host's final response boundary, after response mutation. */
export type AuditHttpFinalizer = (
  context: Context,
  result?: AuditHttpResult,
) => Promise<void>;

export type AuditServiceFactory = (assembly: AuditAssembly) => AuditService;
