export type DeploymentKind = 'deploy' | 'rollback';
export type DeploymentStatus = 'pending' | 'succeeded' | 'unchanged' | 'failed';
export type AppDesiredState = 'running' | 'stopped';
export type AppRuntimeLifecycleState =
  'starting' | 'active' | 'stopping' | 'stopped' | 'failed';
export type AppLifecycleAction = 'start' | 'stop' | 'restart';
export type AppLifecycleOperationStatus =
  'pending' | 'succeeded' | 'unchanged' | 'failed';

export type ManagedAppType = 'app' | 'portal';

export interface ManagedAppRecord {
  id: string;
  name: string;
  type: ManagedAppType;
  basePath: string;
  createdAt: string;
  createdBy: ReleaseActor;
}

export type ReleaseApprovalStatus =
  'pending' | 'executing' | 'rejected' | 'succeeded' | 'failed';

export type ReleaseNotificationEvent =
  | 'approval_requested'
  | 'approval_approved'
  | 'approval_rejected'
  | 'deployment_succeeded'
  | 'deployment_failed';

export interface ReleaseSummary {
  appId: string;
  id: string;
  version: string;
  createdAt: string | null;
  runtime: Record<string, unknown>;
}

export type AppRuntimeResourceStatus =
  'applying' | 'active' | 'restart-required' | 'error';

export interface AppRuntimeResourceSummary {
  id: string;
  kind: string;
  name: string;
  status: AppRuntimeResourceStatus;
  provider: string;
  updatedAt: string;
  details?: Record<string, string | number | boolean | null>;
  error?: {
    code: string;
    message: string;
  } | null;
}

export interface AppReleaseOverview {
  id: string;
  name: string;
  type?: ManagedAppType;
  createdAt?: string | null;
  managed?: boolean;
  basePath: string | null;
  accessUrl: string | null;
  activeReleaseId: string | null;
  activeVersion: string | null;
  state: string;
  desiredState: AppDesiredState;
  runtimeState: AppRuntimeLifecycleState;
  lifecycleError: {
    code: string;
    message: string;
  } | null;
  releases: ReleaseSummary[];
  resources: AppRuntimeResourceSummary[];
}

export interface AppLifecycleOperationRecord {
  id: string;
  idempotencyKey: string;
  appId: string;
  action: AppLifecycleAction;
  status: AppLifecycleOperationStatus;
  changed: boolean | null;
  desiredState: AppDesiredState | null;
  runtimeState: AppRuntimeLifecycleState | null;
  actor: ReleaseActor;
  requestedAt: string;
  completedAt: string | null;
  error: {
    code: string;
    message: string;
  } | null;
}

export interface DeploymentRecord {
  id: string;
  idempotencyKey: string;
  appId: string;
  releaseId: string;
  kind: DeploymentKind;
  status: DeploymentStatus;
  changed: boolean | null;
  previousReleaseId: string | null;
  activeReleaseId: string | null;
  activeVersion: string | null;
  actor: ReleaseActor;
  requestedAt: string;
  completedAt: string | null;
  error: {
    code: string;
    message: string;
  } | null;
}

export interface ReleaseApprovalRecord {
  id: string;
  idempotencyKey: string;
  appId: string;
  releaseId: string;
  kind: DeploymentKind;
  status: ReleaseApprovalStatus;
  requestedBy: ReleaseActor;
  requestedAt: string;
  decidedBy: ReleaseActor | null;
  decidedAt: string | null;
  decisionComment: string | null;
  deploymentId: string | null;
  error: {
    code: string;
    message: string;
  } | null;
}

export interface ReleaseNotificationRecord {
  id: string;
  approvalId: string;
  appId: string;
  releaseId: string;
  event: ReleaseNotificationEvent;
  recipient: ReleaseActor;
  title: string;
  body: string;
  status: 'queued' | 'delivered' | 'failed';
  createdAt: string;
}

export interface ReleaseActor {
  id: string;
  name: string;
  role: string;
}

export interface ActiveAppSummary {
  id: string;
  appName?: string;
  displayName?: string;
  basePath: string;
  accessUrl?: string;
  codeVersion: string;
  releaseId: string | null;
  state: string;
  updatedAt: string;
  resources?: AppRuntimeResourceSummary[];
}

export interface AppHostOverview {
  active: ActiveAppSummary[];
  activeReleases?: Array<{
    appId: string;
    releaseId: string;
    artifactSha256: string;
    activatedAt: string;
  }>;
  definitions: Array<{
    id: string;
    appName?: string;
    displayName?: string;
    basePath: string;
    accessUrl?: string;
  }>;
  releases: ReleaseSummary[];
  lifecycle?: AppHostLifecycleStatus[];
}

export interface AppHostLifecycleStatus {
  appId: string;
  desiredState: AppDesiredState;
  runtimeState: AppRuntimeLifecycleState;
  updatedAt: string | null;
  lastError: {
    code: string;
    message: string;
  } | null;
}

export interface AppHostLifecycleResult extends AppHostLifecycleStatus {
  action: AppLifecycleAction;
  changed: boolean;
}

export interface AppHostDeploymentResult {
  id: string;
  previousReleaseId: string | null;
  activeReleaseId: string | null;
  activeVersion: string;
  changed: boolean;
}

export interface AppHostReleaseUploadResult {
  status: 'created' | 'unchanged';
  appId: string;
  releaseId: string;
  version: string;
  artifactSha256: string;
  archiveBytes: number;
}

export interface ReleaseOverview {
  apps: AppReleaseOverview[];
  managedApps?: ManagedAppRecord[];
  deployments: DeploymentRecord[];
  lifecycleOperations: AppLifecycleOperationRecord[];
  approvals?: ReleaseApprovalRecord[];
  notifications?: ReleaseNotificationRecord[];
}
