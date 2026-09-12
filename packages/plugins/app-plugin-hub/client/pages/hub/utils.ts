import { resolveAppUrl } from '@nocobase/app-client';
import type {
  AppDetail,
  AppOverview,
  AppSummary,
  ConfigMode,
  ApiResponse,
  ReleaseRecord,
} from './types.js';

export type AppManagementStatus =
  | 'host-unavailable'
  | 'deployment-pending'
  | 'not-deployed'
  | 'failed'
  | 'running'
  | 'ready'
  | 'stopped'
  | 'unknown';

export type AppActionReason =
  | 'operationInProgress'
  | 'hostUnavailable'
  | 'deploymentInProgress'
  | 'deployReleaseFirst'
  | 'notRunning'
  | 'currentDeployment'
  | 'deploymentNotSucceeded'
  | 'unavailable';

export interface AppActionState {
  readonly enabled: boolean;
  readonly reason?: AppActionReason;
}

export function appManagementStatus(
  app: AppSummary | AppOverview | AppDetail,
): AppManagementStatus {
  if (!app.runtime.hostAvailable) return 'host-unavailable';
  if (
    app.hasPendingDeployment ||
    app.runtime.state === 'pending' ||
    app.runtime.state === 'queued' ||
    app.runtime.state === 'deploying'
  ) {
    return 'deployment-pending';
  }
  if (!app.app.currentDeploymentId) return 'not-deployed';
  if (app.runtime.state === 'failed') return 'failed';
  if (app.runtime.state === 'running') return 'running';
  const activation =
    'deployment' in app ? app.deployment.activation : app.startupMode;
  if (app.enabled && activation === 'lazy' && app.runtime.state === 'stopped') {
    return 'ready';
  }
  if (!app.enabled && app.runtime.state === 'stopped') return 'stopped';
  return 'unknown';
}

export function appActionState(
  app: AppSummary | AppOverview | AppDetail,
  action: 'start' | 'stop' | 'restart' | 'deploy' | 'rollback',
  busy = false,
): AppActionState {
  if (busy) return { enabled: false, reason: 'operationInProgress' };
  if (action === 'deploy' && !app.hasReleases) {
    return { enabled: false, reason: 'deployReleaseFirst' };
  }
  if ((action === 'deploy' || action === 'rollback') && !('runtime' in app)) {
    return { enabled: true };
  }
  const status = appManagementStatus(app);
  if (status === 'host-unavailable') {
    return { enabled: false, reason: 'hostUnavailable' };
  }
  if (status === 'deployment-pending') {
    return { enabled: false, reason: 'deploymentInProgress' };
  }
  if (action === 'deploy' || action === 'rollback') {
    return { enabled: true };
  }
  if (status === 'not-deployed') {
    return { enabled: false, reason: 'deployReleaseFirst' };
  }
  if (action === 'start') {
    return { enabled: status !== 'running' };
  }
  if (action === 'stop' || action === 'restart') {
    return status === 'running'
      ? { enabled: true }
      : { enabled: false, reason: 'notRunning' };
  }
  return { enabled: false, reason: 'unavailable' };
}

export function appStatusLabel(status: AppManagementStatus): string {
  const labels: Readonly<Record<AppManagementStatus, string>> = {
    'host-unavailable': 'Host unavailable',
    'deployment-pending': 'Deployment pending',
    'not-deployed': 'Not deployed',
    failed: 'Failed',
    running: 'Running',
    ready: 'Ready',
    stopped: 'Stopped',
    unknown: 'Unknown',
  };
  return labels[status];
}
export function configModeLabel(mode: ConfigMode): string {
  return mode === 'file'
    ? 'Config file'
    : mode === 'external'
      ? 'External'
      : 'Hub managed';
}

export async function uploadArtifact(
  appId: string,
  artifact: File,
): Promise<ReleaseRecord> {
  const response = await fetch(
    resolveAppUrl(`/api/hub/apps/${appId}/releases`),
    {
      method: 'POST',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/gzip',
      },
      body: artifact,
    },
  );
  if (!response.ok) throw new Error(await response.text());
  const result = (await response.json()) as ApiResponse<ReleaseRecord>;
  return result.data;
}

export function isClientRecord(
  value: unknown,
): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function shortId(value: string): string {
  return `#${value.slice(0, 8)}`;
}

export function applicationUrl(app: AppDetail): string | null {
  if (!app.hostUrl || !hasDeployment(app)) return null;
  try {
    return new URL(
      app.deployment.basePath.replace(/^\//u, ''),
      ensureSlash(app.hostUrl),
    ).toString();
  } catch {
    return null;
  }
}

export function hasDeployment(app: AppDetail): boolean {
  return (
    app.deployment.desiredReleaseId !== null ||
    app.deployment.observedReleaseId !== null
  );
}

export function ensureSlash(value: string): string {
  return value.endsWith('/') ? value : `${value}/`;
}

export function initials(value: string): string {
  return value
    .split(/\s+/u)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export function stateLabel(value: string): string {
  return value ? `${value[0]?.toUpperCase()}${value.slice(1)}` : 'Unknown';
}

export function deploymentPhaseLabel(value: string): string {
  const labels: Readonly<Record<string, string>> = {
    resolving: 'Preparing release',
    verifying: 'Verifying release',
    extracting: 'Extracting files',
    preparing: 'Preparing application',
    starting: 'Starting application',
    health_check: 'Checking application health',
    switching: 'Activating release',
    cleaning: 'Cleaning up',
  };
  return labels[value] ?? stateLabel(value.replaceAll('_', ' '));
}

export function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) || date.valueOf() <= 0
    ? '—'
    : new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }).format(date);
}

export function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) || date.valueOf() <= 0
    ? '—'
    : new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      }).format(date);
}

export function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

export interface ReadableError {
  readonly code?: string;
  readonly status?: number;
  readonly isTechnical: boolean;
  readonly message: string;
  readonly technicalMessage: string;
}

interface ErrorRecord {
  readonly code?: unknown;
  readonly message?: unknown;
  readonly error?: unknown;
  readonly status?: unknown;
  readonly payload?: unknown;
}

const FALLBACK_ERROR_MESSAGE = 'The operation could not be completed.';

function isRecord(value: unknown): value is ErrorRecord {
  return value !== null && typeof value === 'object';
}

function parseJsonString(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return value;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return value;
  }
}

function nestedErrorRecord(value: unknown): ErrorRecord | undefined {
  if (!isRecord(value)) return undefined;
  return isRecord(value.error) ? value.error : undefined;
}

function errorMessage(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  const nested = nestedErrorRecord(value);
  if (typeof nested?.message === 'string') return nested.message;
  return typeof value.message === 'string' ? value.message : undefined;
}

function errorCode(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  const nested = nestedErrorRecord(value);
  if (typeof nested?.code === 'string') return nested.code;
  return typeof value.code === 'string' ? value.code : undefined;
}

function errorStatus(value: unknown): number | undefined {
  if (!isRecord(value)) return undefined;
  return typeof value.status === 'number' ? value.status : undefined;
}

function errorPayload(value: unknown): unknown {
  return isRecord(value) ? value.payload : undefined;
}

function serializeError(value: unknown): string {
  if (value instanceof Error) {
    return value.message || value.name;
  }
  if (typeof value === 'string') return value;
  try {
    const serialized = JSON.stringify(value, null, 2);
    return serialized ?? String(value);
  } catch {
    return String(value);
  }
}

function isTechnicalMessage(value: string): boolean {
  return /(?:ENOENT|EACCES|ECONNREFUSED|ETIMEDOUT|node:|\/(?:private|var|tmp|Users|home)\/|\bat\s+\S+\s+\()/iu.test(
    value,
  );
}

function inferredErrorCode(value: string): string | undefined {
  return /^Artifact version mismatch\b/iu.test(value)
    ? 'ARTIFACT_VERSION_MISMATCH'
    : undefined;
}

export function readError(value: unknown): ReadableError {
  const payload = value instanceof Error ? errorPayload(value) : undefined;
  const original: unknown =
    value instanceof Error
      ? payload !== undefined
        ? payload
        : value.message
      : value;
  const parsed: unknown =
    typeof original === 'string' ? parseJsonString(original) : original;
  const message =
    errorMessage(parsed) ??
    (typeof parsed === 'string' ? parsed : undefined) ??
    (value instanceof Error ? value.message : undefined) ??
    FALLBACK_ERROR_MESSAGE;
  const technicalMessage =
    typeof value === 'string'
      ? value
      : payload !== undefined
        ? serializeError(payload)
        : serializeError(value);
  const code =
    errorCode(parsed) ?? errorCode(value) ?? inferredErrorCode(message);
  const technical =
    isTechnicalMessage(message) || code === 'ARTIFACT_VERSION_MISMATCH';

  return {
    code,
    status: errorStatus(value),
    isTechnical: technical,
    message: technical ? FALLBACK_ERROR_MESSAGE : message,
    technicalMessage,
  };
}
