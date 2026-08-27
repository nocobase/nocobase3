import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';

import type { AppReleaseManifest } from './release-artifact.ts';

export interface HubReleaseUploadResult {
  release: {
    status: 'created' | 'unchanged';
    appId: string;
    releaseId: string;
    version: string;
    artifactSha256: string;
    archiveBytes: number;
  };
  deployment?: {
    status: 'pending' | 'succeeded' | 'unchanged' | 'failed';
    changed: boolean | null;
    activeReleaseId: string | null;
    activeVersion: string | null;
    error: { code: string; message: string } | null;
  };
  approval?: {
    status: string;
    id: string;
    releaseId: string;
  };
}

export class HubReleaseRequestError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = 'HubReleaseRequestError';
    this.status = status;
    this.code = code;
  }
}

export async function uploadReleaseArchive(options: {
  hub: string;
  token: string;
  archivePath: string;
  manifest: AppReleaseManifest;
}): Promise<HubReleaseUploadResult> {
  const archiveStat = await stat(options.archivePath);
  const archive = Readable.toWeb(
    createReadStream(options.archivePath),
  ) as ReadableStream<Uint8Array>;
  const endpoint = resolveHubReleaseUploadUrl(
    options.hub,
    options.manifest.appId,
  );
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${options.token}`,
        'content-length': String(archiveStat.size),
        'content-type': 'application/gzip',
        'idempotency-key': `deploy-${options.manifest.appId}-${options.manifest.releaseId}`,
        'x-nocobase-release-id': options.manifest.releaseId,
      },
      body: archive,
      duplex: 'half',
      redirect: 'manual',
    });
  } catch (error) {
    throw new HubReleaseRequestError(
      `Unable to reach Hub: ${error instanceof Error ? error.message : String(error)}`,
      0,
      'HUB_UNAVAILABLE',
    );
  }
  const payload = await readJson(response);
  if (!response.ok) {
    const error = asRecord(payload);
    throw new HubReleaseRequestError(
      typeof error?.error === 'string'
        ? error.error
        : `Hub deployment request failed (${response.status})`,
      response.status,
      typeof error?.code === 'string' ? error.code : 'HUB_DEPLOY_FAILED',
    );
  }
  const result = asRecord(payload);
  const release = asRecord(result?.release);
  if (
    !release ||
    release.appId !== options.manifest.appId ||
    release.releaseId !== options.manifest.releaseId
  ) {
    throw new HubReleaseRequestError(
      'Hub returned an invalid release identity.',
      502,
      'HUB_DEPLOY_INVALID_RESPONSE',
    );
  }
  return payload as HubReleaseUploadResult;
}

export function resolveHubReleaseUploadUrl(hub: string, appId: string): URL {
  const url = normalizeHubUrl(hub);
  let base = url.pathname.replace(/\/+$/, '');
  if (!base) base = '/hub';
  if (base.endsWith('/api/release-management')) {
    // The complete API base was provided.
  } else if (base.endsWith('/api')) {
    base = `${base}/release-management`;
  } else {
    base = `${base}/api/release-management`;
  }
  url.pathname = `${base}/apps/${encodeURIComponent(appId)}/releases`;
  return url;
}

export function normalizeHubUrl(hub: string): URL {
  let url: URL;
  try {
    url = new URL(hub);
  } catch (cause) {
    throw new Error('Hub URL must be a valid HTTP(S) URL.', { cause });
  }
  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:') ||
    url.username ||
    url.password
  ) {
    throw new Error('Hub URL must use HTTP(S) without embedded credentials.');
  }
  if (url.search || url.hash) {
    throw new Error('Hub URL must not contain a query string or hash.');
  }
  return url;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new HubReleaseRequestError(
      `Hub returned a non-JSON response (${response.status}).`,
      response.status,
      'HUB_DEPLOY_INVALID_RESPONSE',
    );
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
