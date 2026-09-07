import type { Context, MiddlewareHandler } from 'hono';
import type { TransactionHandle } from '@nocobase/db';
import type { AuditResourceAdapter } from './authorization.js';
export type { TransactionHandle } from '@nocobase/db';

/** App-local resource owners register during boot and release during shutdown. */
export interface AuditResourceAdapters {
  /** Rejects duplicate resource keys or a closed App; returns an idempotent disposer. */
  register(adapter: AuditResourceAdapter): () => void;
}

export type AuditKind = 'request' | 'business' | 'database';
export type AuditOutcome =
  'success' | 'failed' | 'denied' | 'accepted' | 'unknown';
export type AuditJson =
  | null
  | boolean
  | number
  | string
  | readonly AuditJson[]
  | { readonly [key: string]: AuditJson };
export interface Principal {
  readonly type: string;
  readonly id?: string;
  readonly label?: string;
}
export type RecordKey = string | Readonly<Record<string, string | number>>;
export interface ResourceRef {
  readonly dataSource?: string;
  readonly resource: string;
  readonly key?: RecordKey;
  readonly label?: string;
}
export interface TrustedAuditScope {
  readonly appId: string;
  readonly securityScope?: string;
  readonly actor: Principal;
  readonly initiator?: Principal;
  readonly roleIds?: readonly string[];
  readonly operationId?: string;
  readonly requestId?: string;
  readonly runId?: string;
  readonly correlationId?: string;
}
export interface AuditRecordOptions {
  readonly transaction?: TransactionHandle;
  readonly idempotencyKey?: string;
}
export interface AuditEventInput {
  readonly action: string;
  readonly outcome: AuditOutcome;
  readonly target?: ResourceRef;
  readonly source?: ResourceRef;
  readonly details?: Readonly<Record<string, unknown>>;
  readonly id?: never;
  readonly eventVersion?: never;
  readonly roleIds?: never;
  readonly operationId?: never;
  readonly requestId?: never;
  readonly runId?: never;
  readonly correlationId?: never;
  readonly store?: never;
  readonly kind?: never;
  readonly producer?: never;
  readonly appId?: never;
  readonly actor?: never;
  readonly initiator?: never;
  readonly securityScope?: never;
  readonly occurredAt?: never;
  readonly recordedAt?: never;
  readonly policyVersion?: never;
}
export type AuditReceipt =
  | { readonly state: 'committed'; readonly eventId: string }
  | { readonly state: 'pending-commit'; readonly eventId: string }
  | { readonly state: 'disabled'; readonly reason: string }
  | {
      readonly state: 'excluded';
      readonly reason: string;
      readonly policyVersion: number;
    };
export interface AuditRecorder {
  record(
    event: AuditEventInput,
    options?: AuditRecordOptions,
  ): Promise<AuditReceipt>;
}
export type AuditErrorCode =
  | 'AUDIT_NOT_READY'
  | 'AUDIT_INVALID_EVENT'
  | 'AUDIT_TRANSACTION_MISMATCH'
  | 'AUDIT_WRITE_FAILED'
  | 'AUDIT_IDEMPOTENCY_CONFLICT'
  | 'AUDIT_POLICY_CONFLICT'
  | 'AUDIT_TARGET_UNSUPPORTED';
/** Safe fields only; never attach an original event, SQL or underlying error. */
export interface AuditErrorDto {
  readonly code: AuditErrorCode;
  readonly ns: '@nocobase/app-plugin-audit';
  readonly params?: Readonly<Record<string, string | number>>;
  readonly key: string;
  readonly message: string;
}
export interface AuditHttpDeclaration {
  readonly action: string;
  readonly titleKey?: string;
  readonly target?: (context: Context) => ResourceRef | undefined;
  readonly details?: (
    context: Context,
  ) => Readonly<Record<string, unknown>> | undefined;
}
export interface AuditHttpResult {
  readonly outcome: AuditOutcome;
  readonly reasonCode?: string;
}
export interface AuditService {
  bind(
    scope: TrustedAuditScope,
    options: { readonly producer: string },
  ): AuditRecorder;
  http(declaration: AuditHttpDeclaration): MiddlewareHandler;
  /** Trusted server handlers only. The collector reads this at the final boundary. */
  markHttpResult(context: Context, result: AuditHttpResult): void;
}
export type CountSemantics =
  'matched' | 'changed' | 'inserted' | 'deleted' | 'unknown';
export interface AuditDatabaseSummary {
  readonly executionId: string;
  readonly count?: number;
  readonly countSemantics: CountSemantics;
}
export interface AuditHttpSummary {
  readonly method: string;
  readonly routePattern: string;
  readonly httpStatus: number;
  readonly durationMs: number;
}
export interface NormalizedResourceRef extends Omit<ResourceRef, 'key'> {
  readonly appId: string;
  readonly securityScope?: string;
  readonly keyEncoding?: string;
  readonly keyHash?: string;
}
export interface AuditEventDto extends TrustedAuditScope {
  readonly id: string;
  readonly eventVersion: number;
  readonly titleKey?: string;
  readonly kind: AuditKind;
  readonly producer: string;
  readonly action: string;
  readonly outcome: AuditOutcome;
  readonly reasonCode?: string;
  readonly occurredAt: string;
  readonly recordedAt: string;
  readonly store: string;
  readonly policyVersion: number;
  readonly target?: ResourceRef;
  readonly source?: ResourceRef;
  readonly details?: Readonly<Record<string, AuditJson>>;
  readonly captureWarnings?: readonly string[];
  readonly http?: AuditHttpSummary;
  readonly database?: AuditDatabaseSummary;
}
/** Browser filters never carry authoritative identity, App or security scope. */
export interface AuditEventsQuery {
  readonly store: string;
  readonly cursor?: string;
  readonly pageSize?: number;
  readonly from?: string;
  readonly to?: string;
  readonly action?: string;
  readonly kind?: AuditKind;
  readonly outcome?: AuditOutcome;
  readonly actorType?: string;
  readonly actorId?: string;
  readonly target?: ResourceRef;
  readonly operationId?: string;
  readonly requestId?: string;
  readonly runId?: string;
}
export interface AuditEventsPage {
  readonly items: readonly AuditEventDto[];
  readonly nextCursor?: string;
}
export interface AuditEventLookup {
  readonly store: string;
  readonly id: string;
}
export interface AuditOperationQuery extends AuditEventLookup {
  readonly cursor?: string;
  readonly pageSize?: number;
}
export interface AuditTablePolicy {
  readonly dataSource: string;
  readonly table: string;
  readonly schema?: string;
}
export interface AuditSettings {
  readonly revision: number;
  readonly enabled: boolean;
  readonly observationStore: string;
  readonly sources: {
    readonly http: 'disabled' | 'declared-routes';
    readonly runtime: 'disabled' | 'integrated-producers';
    readonly database: readonly AuditTablePolicy[];
  };
  readonly retentionDays: number | null;
  readonly maxDetailsBytes: number;
}
export interface AuditSettingsUpdate {
  readonly expectedRevision: number;
  readonly settings: Omit<AuditSettings, 'revision'>;
  readonly confirmRetentionReduction: boolean;
}
export interface AuditSettingsMetadata {
  readonly requirements: AuditDeploymentRequirements;
  readonly canManage: boolean;
  readonly stores: readonly string[];
  /** False when the reader cannot inspect every configured target. Editing is unsafe. */
  readonly complete: boolean;
}
export interface AuditSettingsResponse {
  readonly data: AuditSettings;
  readonly meta?: AuditSettingsMetadata;
}
export interface AuditDeclaredRoute {
  readonly titleKey?: string;
  readonly method: string;
  readonly path: string;
  readonly action: string;
}
export interface AuditCaptureMetadata {
  readonly producer: string;
  readonly kind: AuditKind;
  readonly dataSource: string;
  readonly configured: boolean;
  readonly registered: boolean;
  readonly verified: boolean;
  readonly targets: readonly AuditTablePolicy[];
}
export interface AuditDeploymentRequirements {
  readonly auditRequired: boolean;
  readonly requiredDataSources: readonly string[];
  readonly mandatorySources: readonly AuditKind[];
}
export type AuditHealthState =
  | 'disabled'
  | 'ready-no-events'
  | 'healthy'
  | 'degraded'
  | 'misconfigured'
  | 'partial-coverage';
export interface AuditCoverage {
  readonly producer: string;
  readonly store: string;
  readonly configured: boolean;
  readonly registered: boolean;
  readonly observed: boolean;
  readonly lastSuccessAt?: string;
  readonly lastError?: {
    readonly code: AuditErrorCode;
    readonly occurredAt: string;
  };
}
export interface AuditHealthDto {
  readonly observedAt?: string;
  readonly captures?: readonly AuditCaptureMetadata[];
  readonly declaredRoutes?: readonly AuditDeclaredRoute[];
  readonly declarationObservation?: 'static' | 'unknown';
  readonly instanceId: string;
  readonly observation: 'local' | 'unknown';
  readonly state: AuditHealthState;
  readonly coverage: readonly AuditCoverage[];
  readonly cleanup?: {
    readonly store: string;
    readonly cutoff: string;
    readonly deletedCount: number;
    readonly occurredAt: string;
  };
}
export interface AuditHealthQuery {
  readonly instanceId?: string;
  readonly store?: string;
}
