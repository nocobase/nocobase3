import { getPortalBase } from '@nocobase/app-portal-sdk/runtime';
import type {
  StorageSettingsDraft,
  StorageSettingsResponse,
  StorageTestResponse,
} from './types';

export async function fetchStorageSettings(
  appId?: string,
  signal?: AbortSignal,
): Promise<StorageSettingsResponse | null> {
  const payload = await request<{ data: StorageSettingsResponse | null }>(
    storagePath(appId),
    { method: 'GET', signal },
  );
  return payload.data;
}

export async function saveStorageSettings(
  draft: StorageSettingsDraft,
  appId?: string,
): Promise<StorageSettingsResponse> {
  const payload = await request<{ data: StorageSettingsResponse }>(
    storagePath(appId),
    {
      method: 'PUT',
      body: draft,
    },
  );
  return payload.data;
}

export async function testStorageSettings(
  draft: StorageSettingsDraft,
  appId?: string,
): Promise<StorageTestResponse> {
  const payload = await request<{ data: StorageTestResponse }>(
    `${storagePath(appId)}/test`,
    { method: 'POST', body: draft },
  );
  return payload.data;
}

function storagePath(appId?: string): string {
  return appId ? `/apps/${encodeURIComponent(appId)}/storage` : '/storage';
}

async function request<T>(
  path: string,
  options: {
    method: 'GET' | 'POST' | 'PUT';
    body?: unknown;
    signal?: AbortSignal;
  },
): Promise<T> {
  const response = await fetch(resolveSettingsApiUrl(path), {
    method: options.method,
    headers: {
      Accept: 'application/json',
      'X-Requested-With': 'NocoBase3',
      ...(options.body === undefined
        ? {}
        : { 'Content-Type': 'application/json' }),
    },
    credentials: 'include',
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal,
  });
  const payload = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  if (!response.ok) {
    throw new Error(
      typeof payload.error === 'string'
        ? payload.error
        : `配置请求失败 (${response.status})`,
    );
  }
  return payload as T;
}

function resolveSettingsApiUrl(path: string): string {
  const basePath = getPortalBase().replace(/\/+$/, '');
  return `${basePath}/api/settings${path}`;
}
