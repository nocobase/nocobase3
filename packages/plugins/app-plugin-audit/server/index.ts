export { default } from './plugin.js';
export { auditServiceToken, auditResourceAdaptersToken } from './tokens.js';
export { DisabledAuditRecorder } from './disabled-recorder.js';
export type {
  AuditService,
  AuditResourceAdapters,
  AuditRecorder,
  AuditReceipt,
  AuditEventInput,
} from './contracts.js';
export { bindAuditRecorder } from './service.js';
export type {
  AuditRecorderPolicy,
  BoundAuditRecorderOptions,
} from './service.js';
export { SqliteAuditStore, PortableAuditStore } from './store.js';
export type { AuditStoreBinding } from './store.js';

export { NodeAuditScopeCarrier } from './scope.js';
export { TrustedAuditRuntime } from './runtime.js';
export type {
  AuditRuntimeOptions,
  AuditRuntimeIdentity,
  AuditBackgroundTrace,
  AuditBackgroundVerifier,
} from './runtime.js';
export { createAuditScopeResources } from './providers/scope.js';
export type { AuditScopeResources } from './providers/scope.js';

export { PersistentAuditSettingsService } from './settings-service.js';
export type { PersistentAuditSettingsOptions } from './settings-service.js';
export { LocalAuditHealthService } from './health-service.js';
export type {
  AuditInstanceObservation,
  AuditHealthDiagnostic,
} from './health-service.js';
export { AuditCaptureCatalog } from './capture-catalog.js';
export type {
  AuditCaptureRegistration,
  AuditCaptureEntry,
  AuditCaptureHandle,
} from './capture-catalog.js';
export { AuditReadiness } from './providers/readiness.js';
export type {
  AuditReadinessOptions,
  AuditReadinessStore,
} from './providers/readiness.js';

export { AuditDatabaseCollector } from './database-collector.js';
export type { AuditDatabaseCollectorOptions } from './database-collector.js';
export { createAuditDatabaseCollector } from './providers/database.js';
export type { AuditSettingsReadOptions } from './settings-service.js';

export { AuditHttpCollector } from './http.js';
export type { AuditHttpCollectorOptions } from './http.js';
export { createAuditHttpResources } from './providers/http.js';
export type {
  AuditHttpResources,
  AuditHttpResourcesOptions,
} from './providers/http.js';

export { createAuditQueryResources } from './providers/routes.js';
export type {
  AuditQueryResources,
  AuditQueryResourcesOptions,
} from './providers/routes.js';
export { createAuditApiRoutes } from './routes/index.js';
export type { AuditApiRoutesOptions } from './routes/index.js';
export {
  auditPermissionId,
  AuditAccessDenied,
  registerAuditPermissions,
  AuditAuthorization,
} from './authorization.js';
export type {
  AuditResourceAdapter,
  AuditAuthorizationOptions,
} from './authorization.js';
export { createAuditDatabaseResourceAdapter } from './query-resource.js';
export type { AuditDatabaseResourceOptions } from './query-resource.js';
export { ScopedAuditQueryService } from './query-service.js';

export { AuditRetentionService } from './retention-service.js';
export type {
  AuditRetentionOptions,
  AuditRetentionPlan,
  AuditCleanupResult,
  AuditRetentionObservation,
} from './retention-service.js';
export { createAuditRetentionQueueResources } from './queue/retention.js';
export type { AuditRetentionQueueResources } from './queue/retention.js';
export { createAuditLifecycleResources } from './providers/lifecycle.js';
export type {
  AuditLifecycleOptions,
  AuditLifecycleResources,
} from './providers/lifecycle.js';

export { auditConfig } from './config.js';
export type { AuditConfig } from './config.js';
