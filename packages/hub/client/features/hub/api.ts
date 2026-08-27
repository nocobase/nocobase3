import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export interface HubPageMeta {
  total?: number;
  limit?: number;
  offset?: number;
  [key: string]: unknown;
}

export interface HubEnvelope<T> {
  data: T;
  meta?: HubPageMeta;
  requestId?: string;
}

export interface HubErrorPayload {
  code?: string;
  message?: string;
  retryable?: boolean;
  issues?: Array<{ path?: string; code?: string; message?: string }>;
}

export interface HubErrorEnvelope {
  error?: HubErrorPayload | string;
  requestId?: string;
}

export type HubApplicationStatus = 'active' | 'disabled' | 'archived' | string;

export interface HubApplication {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  status: HubApplicationStatus;
  defaultEnvironmentId: string;
  isDefault?: boolean;
  revision?: number;
  latestRelease?: HubReleaseSummary | null;
  activeRelease?: HubReleaseSummary | HubRelease | null;
  runtime?: HubRuntimeSummary;
  runtimeSecret?: HubRuntimeSecretSummary;
  links?: HubApplicationLinks;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface HubApplicationLinks {
  self: string;
  open: string | null;
}

export interface HubReleaseSummary {
  id: string;
  version: string;
  createdAt: string;
}

export interface HubRuntimeSummary {
  state: string;
  health: string;
  releaseId: string | null;
  lastCheckedAt: string | null;
}

export interface HubRuntime {
  applicationId: string;
  environmentId: string;
  runtimeId: string | null;
  state: string;
  health: string;
  releaseId: string | null;
  releaseVersion?: string | null;
  url?: string | null;
  startedAt: string | null;
  lastSeenAt: string | null;
  lastCheckedAt?: string | null;
  activeRequests?: number | null;
  failure?: HubDeploymentFailure | null;
}

export interface HubRuntimeSecretSummary {
  configured: boolean;
  version: number;
  createdAt?: string | null;
  rotatedAt: string | null;
  lastInjectedAt?: string | null;
}

export type HubReleaseVerificationStatus =
  'pending' | 'verified' | 'rejected' | string;

export interface HubRelease {
  id: string;
  applicationId: string;
  version: string;
  checksum: string;
  manifest: Record<string, unknown>;
  sizeBytes: number | null;
  verificationStatus: HubReleaseVerificationStatus;
  retention?: {
    pinned: boolean;
    pinnedBy: string | null;
    pinnedAt: string | null;
  };
  createdBy: string;
  createdAt: string;
}

export interface HubRole {
  id?: string;
  key?: string;
  name?: string;
  scope: 'global' | 'application' | string;
  scopes?: string[];
  descriptionKey?: string;
  capabilities: HubCapability[];
}

export interface HubMemberApplicationAccess {
  applicationId: string;
  roles: string[];
}

export interface HubMemberAccess {
  revision: number;
  globalRoles: string[];
  applications: HubMemberApplicationAccess[];
}

export interface HubApplicationAccess {
  memberId?: string;
  id?: string;
  name: string;
  email: string;
  username?: string | null;
  status: string;
  roles: Array<string | { key?: string; name?: string }>;
  revision?: number;
}

export interface HubMember {
  id: string;
  name: string;
  email: string;
  username?: string | null;
  status: string;
  roles?: Array<string | { key?: string; name?: string }>;
  globalRoles?: string[];
  visibleApplicationCount?: number;
  lastActiveAt?: string | null;
  createdAt: string;
  revision: number;
}

export interface HubInvitation {
  id: string;
  email: string;
  access?: {
    globalRoles: string[];
    applications: HubMemberApplicationAccess[];
  };
  status: string;
  invitedBy?: string;
  expiresAt: string;
  acceptedBy?: string | null;
  acceptedAt?: string | null;
  revokedAt?: string | null;
  createdAt: string;
  updatedAt?: string;
  inviteUrl?: string;
}

export interface HubResolvedInvitationRole {
  id: string;
  name: string;
}

export interface HubResolvedInvitationApplication {
  name: string;
  roles: HubResolvedInvitationRole[];
}

export interface HubResolvedInvitation {
  email: string;
  hubDisplayName: string;
  access: {
    globalRoles: HubResolvedInvitationRole[];
    applications: HubResolvedInvitationApplication[];
  };
  expiresAt: string;
}

export interface HubAcceptedInvitationMember {
  id: string;
  name: string;
  email: string;
  username: string | null;
  status: 'active';
  roles?: string[];
  applicationIds?: string[];
  createdAt?: string;
  revision?: number;
}

export interface HubAgentApplicationScope {
  mode: 'selected' | 'all-authorized';
  applicationIds?: string[];
}

export interface HubAgentCredential {
  id: string;
  clientId: string;
  clientName: string;
  scopes: string[];
  applicationScope: HubAgentApplicationScope;
  status: string;
  createdAt: string;
  lastUsedAt: string | null;
  accessTokenExpiresAt: string;
  refreshTokenExpiresAt: string;
  revokedAt: string | null;
}

export interface HubAgentAuthorization {
  id: string;
  clientId: string;
  clientName: string;
  requestedScopes: string[];
  requestedApplicationScope: HubAgentApplicationScope;
  status: string;
  expiresAt: string;
}

export interface HubAgentAuthorizationDecision {
  status: string;
}

export interface HubAuditLog {
  id: string;
  actor: {
    type: string;
    id: string | null;
    name: string;
    email?: string | null;
  };
  application?: {
    id: string;
    name: string;
    slug: string;
  } | null;
  action: string;
  resource: string;
  resourceId: string | null;
  result: string;
  source: string;
  client?: { name?: string | null; ip?: string | null } | null;
  details?: Record<string, unknown>;
  requestId?: string | null;
  createdAt: string;
}

export interface HubSettings {
  releaseRetention: {
    automaticCleanupEnabled: boolean;
    keepPerApplication: number;
    minimumAgeDays: number;
  };
  audit: {
    recordDeniedMutations: boolean;
    retentionDays: number;
  };
  confirmation: {
    rollback: boolean;
    archiveApplication: boolean;
    rotateRuntimeSecret: boolean;
  };
  readOnly: {
    releaseStorage: string;
    hostMode: string;
    environmentCount: number;
  };
  revision: number;
  updatedAt: string;
}

export interface HubSystemInfo {
  hubVersion?: string;
  nodeVersion?: string;
  databaseType?: string;
  hostMode?: string;
  hostAvailable?: boolean;
  publicBasePath?: string;
  startedAt?: string;
  warnings?: string[];
}

export interface HubStorageCategory {
  key: string;
  labelKey: string;
  descriptionKey: string;
  bytes: number;
  reclaimableBytes: number | null;
  scope: string;
  accuracy: string;
}

export interface HubStorage {
  filesystem: {
    capacityBytes: number;
    usedBytes: number;
    availableBytes: number;
    usedPercent: number;
  };
  knownUsageBytes: number;
  categories: HubStorageCategory[];
  measuredAt: string;
}

export interface HubCleanupPlan {
  totalReclaimableBytes: number;
  candidates: Array<{
    kind: string;
    applicationId?: string | null;
    resourceId: string;
    bytes: number;
    reason: string;
  }>;
  protectedCounts: Record<string, number>;
  measuredAt: string;
}

export type HubDeploymentStatus =
  | 'queued'
  | 'preparing'
  | 'activating'
  | 'checking'
  | 'switching'
  | 'draining'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | string;

export type HubDeploymentType = 'deploy' | 'rollback' | 'redeploy' | string;

export interface HubDeploymentFailure {
  code: string;
  message: string;
}

export interface HubDeployment {
  id: string;
  applicationId: string;
  environmentId: string;
  targetReleaseId: string;
  previousReleaseId: string | null;
  type: HubDeploymentType;
  status: HubDeploymentStatus;
  requestedBy: string;
  startedAt: string | null;
  finishedAt: string | null;
  failure?: HubDeploymentFailure | null;
  createdAt: string;
}

export interface HubDeploymentEvent {
  id: string;
  deploymentId: string;
  sequence: number;
  type: string;
  status: HubDeploymentStatus;
  message: string | null;
  hostId: string | null;
  runtimeId: string | null;
  details: Record<string, unknown>;
  createdAt: string;
}

export interface HubCapability {
  resource: string;
  actions: string[];
}

export interface HubApplicationCapabilities {
  applicationId: string;
  capabilities: HubCapability[];
}

export interface HubCapabilities {
  global?: HubCapability[];
  application?: HubApplicationCapabilities[];
}

export interface HubUserSummary {
  id: string;
  name: string;
  email: string;
  username?: string | null;
}

export interface HubMe {
  user: HubUserSummary | null;
  roles: string[];
  capabilities: HubCapabilities;
}

export type HubFetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

const DEFAULT_API_BASE = '/hub/api';
const defaultFetcher: HubFetcher = (input, init) => fetch(input, init);
let unauthorizedHandler: (() => void) | undefined;

export function setHubUnauthorizedHandler(
  handler: (() => void) | undefined,
): void {
  unauthorizedHandler = handler;
}

/** Resolve the browser-injected Hub API base without coupling pages to the host. */
export function getHubApiBase(): string {
  const runtime = globalThis as typeof globalThis & {
    NOCOBASE_API_URL?: unknown;
  };
  const candidate =
    typeof globalThis !== 'undefined' &&
    typeof runtime.NOCOBASE_API_URL === 'string'
      ? runtime.NOCOBASE_API_URL
      : '';
  const value = candidate.trim();
  if (!value || value === 'false' || value === '0') return DEFAULT_API_BASE;
  return value.replace(/\/+$/, '') || DEFAULT_API_BASE;
}

export function buildHubApiUrl(path: string, base = getHubApiBase()): string {
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(path)) return path;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(base)) {
    return new URL(normalizedPath.replace(/^\//, ''), `${base}/`).toString();
  }
  return `${base.replace(/\/+$/, '')}${normalizedPath}`;
}

export class HubApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId?: string;
  readonly retryable?: boolean;

  constructor(
    message: string,
    options: {
      status?: number;
      code?: string;
      requestId?: string;
      retryable?: boolean;
    } = {},
  ) {
    super(message);
    this.name = 'HubApiError';
    this.status = options.status ?? 500;
    this.code = options.code ?? 'HUB_REQUEST_FAILED';
    this.requestId = options.requestId;
    this.retryable = options.retryable;
  }
}

function parseErrorPayload(payload: unknown): HubErrorPayload {
  if (typeof payload === 'string') return { message: payload };
  if (!payload || typeof payload !== 'object') return {};
  const value = payload as HubErrorPayload;
  return {
    code: typeof value.code === 'string' ? value.code : undefined,
    message: typeof value.message === 'string' ? value.message : undefined,
    retryable: value.retryable,
    issues: value.issues,
  };
}

/** Validate and return the stable Hub response envelope. */
export function unwrapHubResponse<T>(
  payload: unknown,
  status = 200,
): HubEnvelope<T> {
  if (!payload || typeof payload !== 'object') {
    throw new HubApiError('Hub returned an invalid response.', { status });
  }

  const value = payload as Partial<HubEnvelope<T>> & HubErrorEnvelope;
  if (value.error) {
    const error = parseErrorPayload(value.error);
    throw new HubApiError(error.message ?? 'Hub request failed.', {
      status,
      code: error.code,
      requestId: value.requestId,
      retryable: error.retryable,
    });
  }

  if (status >= 400) {
    throw new HubApiError('Hub request failed.', {
      status,
      requestId: value.requestId,
    });
  }

  if (!('data' in value)) {
    throw new HubApiError('Hub returned a response without data.', {
      status,
      requestId: value.requestId,
    });
  }

  return {
    data: value.data as T,
    meta: value.meta,
    requestId: value.requestId,
  };
}

export async function hubRequest<T>(
  path: string,
  init: RequestInit = {},
  fetcher: HubFetcher = defaultFetcher,
): Promise<HubEnvelope<T>> {
  const headers = new Headers(init.headers);
  headers.set('accept', 'application/json');
  if (init.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }

  let response: Response;
  try {
    response = await fetcher(buildHubApiUrl(path), {
      ...init,
      headers,
      credentials: init.credentials ?? 'include',
    });
  } catch (error) {
    throw new HubApiError(
      error instanceof Error ? error.message : 'Unable to reach Hub.',
      { code: 'NETWORK_ERROR', status: 0, retryable: true },
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new HubApiError('Hub returned an unreadable response.', {
      status: response.status,
    });
  }
  try {
    return unwrapHubResponse<T>(payload, response.status);
  } catch (error) {
    if (
      error instanceof HubApiError &&
      (error.status === 401 || error.code === 'UNAUTHORIZED')
    ) {
      unauthorizedHandler?.();
    }
    throw error;
  }
}

export function hubGet<T>(
  path: string,
  fetcher?: HubFetcher,
): Promise<HubEnvelope<T>> {
  return hubRequest<T>(path, { method: 'GET' }, fetcher);
}

export function hubPost<T>(
  path: string,
  body: unknown,
  fetcher?: HubFetcher,
): Promise<HubEnvelope<T>> {
  return hubRequest<T>(
    path,
    { method: 'POST', body: JSON.stringify(body) },
    fetcher,
  );
}

export function hubPatch<T>(
  path: string,
  body: unknown,
  fetcher?: HubFetcher,
  headers?: HeadersInit,
): Promise<HubEnvelope<T>> {
  return hubRequest<T>(
    path,
    { method: 'PATCH', headers, body: JSON.stringify(body) },
    fetcher,
  );
}

export function hubPut<T>(
  path: string,
  body: unknown,
  fetcher?: HubFetcher,
  headers?: HeadersInit,
): Promise<HubEnvelope<T>> {
  return hubRequest<T>(
    path,
    { method: 'PUT', headers, body: JSON.stringify(body) },
    fetcher,
  );
}

export function hubDelete<T>(
  path: string,
  fetcher?: HubFetcher,
): Promise<HubEnvelope<T>> {
  return hubRequest<T>(path, { method: 'DELETE' }, fetcher);
}

function normalizeCapabilityPart(value: string): string {
  return value.trim().toLowerCase().replace(/_/g, '-');
}

function resourceMatches(actual: string, requested: string): boolean {
  const left = normalizeCapabilityPart(actual);
  const right = normalizeCapabilityPart(requested);
  return (
    left === right || left === right.replace(/s$/, '') || right === `${left}s`
  );
}

/** Capability checks are intentionally fail-closed; the API remains authoritative. */
export function hasHubCapability(
  capabilities: HubCapabilities | undefined,
  resource: string,
  action: string,
  applicationId?: string,
): boolean {
  if (!capabilities) return false;
  const requestedAction = normalizeCapabilityPart(action);
  const applicationEntries = applicationId
    ? (capabilities.application ?? [])
        .filter((group) => group.applicationId === applicationId)
        .flatMap((group) => group.capabilities)
    : [];
  const entries = [...(capabilities.global ?? []), ...applicationEntries];
  return entries.some((entry) => {
    const resourceOkay =
      entry.resource === '*' || resourceMatches(entry.resource, resource);
    if (!resourceOkay) return false;
    return entry.actions.some(
      (candidate) =>
        candidate === '*' ||
        normalizeCapabilityPart(candidate) === requestedAction,
    );
  });
}

export interface HubQueryState<T> {
  data: T | null;
  meta: HubPageMeta | undefined;
  requestId: string | undefined;
  loading: boolean;
  error: HubApiError | Error | null;
  reload: () => void;
}

export interface UseHubQueryOptions<T> {
  path: string | null;
  fetcher?: HubFetcher;
  initialData?: T | null;
  enabled?: boolean;
  transform?: (value: T) => T;
}

export function useHubQuery<T>({
  path,
  fetcher = defaultFetcher,
  initialData = null,
  enabled = true,
  transform,
}: UseHubQueryOptions<T>): HubQueryState<T> {
  const [data, setData] = useState<T | null>(initialData);
  const [meta, setMeta] = useState<HubPageMeta | undefined>();
  const [requestId, setRequestId] = useState<string | undefined>();
  const [loading, setLoading] = useState(
    Boolean(path && enabled && !initialData),
  );
  const [error, setError] = useState<HubApiError | Error | null>(null);
  const [revision, setRevision] = useState(0);
  const transformRef = useRef(transform);
  transformRef.current = transform;

  useEffect(() => {
    let cancelled = false;
    if (!path || !enabled) {
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setLoading(true);
    setError(null);
    void hubGet<T>(path, fetcher)
      .then((result) => {
        if (cancelled) return;
        const next = transformRef.current
          ? transformRef.current(result.data)
          : result.data;
        setData(next);
        setMeta(result.meta);
        setRequestId(result.requestId);
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setError(reason instanceof Error ? reason : new Error(String(reason)));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [fetcher, path, enabled, revision]);

  const reload = useCallback(() => setRevision((value) => value + 1), []);
  return useMemo(
    () => ({ data, meta, requestId, loading, error, reload }),
    [data, error, loading, meta, reload, requestId],
  );
}
