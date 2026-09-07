import { resolveAppUrl } from '@nocobase/app-client';
import type {
  AppDetail,
  ConfigMode,
  ApiResponse,
  ReleaseRecord,
} from './types.js';
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

export function readError(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
}
