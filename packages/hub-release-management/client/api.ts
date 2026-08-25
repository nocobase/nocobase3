import type {
  DeploymentKind,
  DeploymentRecord,
  AppLifecycleAction,
  AppLifecycleOperationRecord,
  ReleaseApprovalRecord,
  ReleaseOverview,
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
      '发布管理返回了无效结果',
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
    method?: 'GET' | 'POST';
    headers?: Record<string, string>;
    body?: unknown;
    signal?: AbortSignal;
    acceptErrorPayload?: boolean;
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
  const response = await fetch(resolveReleaseApiUrl(path), {
    method,
    headers,
    credentials: 'include',
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal,
  });
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
        : `发布管理请求失败 (${response.status})`,
      typeof payload.code === 'string' ? payload.code : 'RELEASE_API_ERROR',
      response.status,
    );
  }
  return payload as T;
}

function resolveReleaseApiUrl(path: string): string {
  const basePath = getPortalBase().replace(/\/+$/, '');
  return `${basePath}/api/release-management${path}`;
}

function getPortalBase(): string {
  if (typeof window === 'undefined') return '';
  const runtimeWindow = window as Window & { NOCOBASE_PORTAL_BASE?: unknown };
  const configured = runtimeWindow.NOCOBASE_PORTAL_BASE;
  if (typeof configured !== 'string') return '';
  const normalized = configured.trim();
  if (!normalized || normalized === '/') return '';
  return `/${normalized.replace(/^\/+|\/+$/g, '')}`;
}
