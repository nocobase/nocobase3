export const APPLICATION_STATUSES = ['active', 'disabled', 'archived'] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const RELEASE_STATUSES = ['pending', 'verified', 'rejected'] as const;
export type ReleaseVerificationStatus = (typeof RELEASE_STATUSES)[number];

export const DEPLOYMENT_STATUSES = [
  'queued',
  'preparing',
  'activating',
  'checking',
  'switching',
  'draining',
  'succeeded',
  'failed',
  'cancelled',
] as const;
export type DeploymentStatus = (typeof DEPLOYMENT_STATUSES)[number];

export const DEPLOYMENT_TYPES = ['deploy', 'rollback', 'redeploy'] as const;
export type DeploymentType = (typeof DEPLOYMENT_TYPES)[number];

export const HUB_ROLES = [
  'owner',
  'admin',
  'developer',
  'deployer',
  'viewer',
] as const;
export type HubRole = (typeof HUB_ROLES)[number];

export interface HubApplication {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  status: ApplicationStatus;
  defaultEnvironmentId: string;
  activeReleaseId: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface HubRelease {
  id: string;
  applicationId: string;
  version: string;
  checksum: string;
  manifest: Record<string, unknown>;
  storageKey: string | null;
  sizeBytes: number | null;
  sourceCommit: string | null;
  verificationStatus: ReleaseVerificationStatus;
  createdBy: string;
  createdAt: string;
}

export interface HubDeployment {
  id: string;
  applicationId: string;
  environmentId: string;
  targetReleaseId: string;
  previousReleaseId: string | null;
  type: DeploymentType;
  status: DeploymentStatus;
  requestedBy: string;
  idempotencyKey: string | null;
  hostOperationId: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  createdAt: string;
}

export interface HubDeploymentEvent {
  id: string;
  deploymentId: string;
  sequence: number;
  type: string;
  status: DeploymentStatus;
  message: string | null;
  hostId: string | null;
  runtimeId: string | null;
  details: Record<string, unknown>;
  createdAt: string;
}

export interface HubRuntimeSnapshot {
  id: string;
  applicationId: string;
  environmentId: string;
  runtimeId: string | null;
  releaseId: string | null;
  state: string;
  health: string;
  startedAt: string | null;
  lastSeenAt: string | null;
  updatedAt: string;
}

export interface HubUserSummary {
  id: string;
  name: string;
  email: string;
  username?: string | null;
}

export interface HubCapability {
  resource: string;
  actions: string[];
}

export interface HubActor {
  user: HubUserSummary;
  roles: HubRole[];
}

export interface HubPageMeta {
  total: number;
  limit: number;
  offset: number;
}

export interface HubSuccessMeta extends Partial<HubPageMeta> {
  [key: string]: unknown;
}

export interface HubErrorIssue {
  path?: string;
  code: string;
  message: string;
}

export interface HubErrorBody {
  code: string;
  message: string;
  retryable: boolean;
  issues?: HubErrorIssue[];
}
