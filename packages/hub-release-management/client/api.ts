import { getPortalBase } from '@nocobase/app-portal-sdk/runtime';

import type {
  DeploymentKind,
  DeploymentRecord,
  AppLifecycleAction,
  AppLifecycleOperationRecord,
  ReleaseApprovalRecord,
  ReleaseOverview,
  ManagedAppRecord,
  ManagedAppType,
} from './types.js';

export class ReleaseApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ReleaseApiError';
  }
}

export interface ExecuteReleaseInput {
  appId: string;
  releaseId: string;
  kind: DeploymentKind;
  idempotencyKey: string;
}

export async function fetchReleaseOverview(
  signal?: AbortSignal,
): Promise<ReleaseOverview> {
  return request<ReleaseOverview>('/overview', { signal });
}

export interface CreateManagedAppInput {
  id: string;
  name?: string;
  type?: ManagedAppType;
}

export interface CreateManagedAppResult {
  app: ManagedAppRecord;
  created: boolean;
}

export async function createManagedApp(
  input: CreateManagedAppInput,
): Promise<CreateManagedAppResult> {
  return request<CreateManagedAppResult>('', {
    method: 'POST',
    body: input,
    namespace: 'apps',
  });
}

export interface UnregisterManagedAppResult {
  appId: string;
  removed: boolean;
}

export async function unregisterManagedApp(
  appId: string,
): Promise<UnregisterManagedAppResult> {
  return request<UnregisterManagedAppResult>(`/${encodeURIComponent(appId)}`, {
    method: 'DELETE',
    namespace: 'apps',
  });
}

export async function executeRelease(
  input: ExecuteReleaseInput,
): Promise<DeploymentRecord | ReleaseApprovalRecord> {
  const action = input.kind === 'rollback' ? 'rollbacks' : 'deployments';
  const response = await request<{
    deployment?: DeploymentRecord;
    approval?: ReleaseApprovalRecord;
  }>(`/apps/${encodeURIComponent(input.appId)}/${action}`, {
    method: 'POST',
    headers: { 'Idempotency-Key': input.idempotencyKey },
    body: { releaseId: input.releaseId },
    acceptErrorPayload: true,
  });
  const result = response.approval ?? response.deployment;
  if (!result) {
    throw new ReleaseApiError(
      '部署管理返回了无效结果',
      'RELEASE_API_INVALID_RESPONSE',
      502,
    );
  }
  return result;
}

export interface ExecuteAppLifecycleInput {
  appId: string;
  action: AppLifecycleAction;
  idempotencyKey: string;
}

export async function executeAppLifecycle(
  input: ExecuteAppLifecycleInput,
): Promise<AppLifecycleOperationRecord> {
  const response = await request<{ operation: AppLifecycleOperationRecord }>(
    `/apps/${encodeURIComponent(input.appId)}/lifecycle`,
    {
      method: 'POST',
      headers: { 'Idempotency-Key': input.idempotencyKey },
      body: { action: input.action },
    },
  );
  return response.operation;
}

export interface DecideReleaseApprovalInput {
  approvalId: string;
  decision: 'approve' | 'reject';
  comment?: string;
}

export async function decideReleaseApproval(
  input: DecideReleaseApprovalInput,
): Promise<ReleaseApprovalRecord> {
  const response = await request<{ approval: ReleaseApprovalRecord }>(
    `/approvals/${encodeURIComponent(input.approvalId)}/decision`,
    {
      method: 'POST',
      body: { decision: input.decision, comment: input.comment },
    },
  );
  return response.approval;
}

async function request<T>(
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'DELETE';
    headers?: Record<string, string>;
    body?: unknown;
    signal?: AbortSignal;
    acceptErrorPayload?: boolean;
    namespace?: 'apps' | 'release-management';
  } = {},
): Promise<T> {
  const method = options.method ?? 'GET';
  const headers = {
    Accept: 'application/json',
    'X-Requested-With': 'NocoBase3',
    ...(options.body === undefined
      ? {}
      : { 'Content-Type': 'application/json' }),
    ...options.headers,
  };
  const response = await fetch(
    resolveHubApiUrl(options.namespace ?? 'release-management', path),
    {
      method,
      headers,
      credentials: 'include',
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    },
  );
  const payload = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  if (
    !response.ok &&
    !(options.acceptErrorPayload && (payload.deployment || payload.approval))
  ) {
    throw new ReleaseApiError(
      typeof payload.error === 'string'
        ? payload.error
        : `${options.namespace === 'apps' ? '应用管理' : '部署管理'}请求失败 (${response.status})`,
      typeof payload.code === 'string' ? payload.code : 'RELEASE_API_ERROR',
      response.status,
    );
  }
  return payload as T;
}

function resolveHubApiUrl(
  namespace: 'apps' | 'release-management',
  path: string,
): string {
  const basePath = getPortalBase().replace(/\/+$/, '');
  return `${basePath}/api/${namespace}${path}`;
}
