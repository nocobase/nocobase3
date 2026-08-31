import type { Hono } from 'hono';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createApp, normalizeBasePath } from './app.js';
import { getEnvBoolean, getEnvString, readEnvFiles } from './env.js';

export type AppDisposer = () => void | Promise<void>;

export interface AppScope {
  readonly id: string;
  readonly appName?: string;
  readonly version?: number;
  readonly basePath: string;
  readonly rootDir?: string;
  readonly clientDir?: string;
  readonly config?: unknown;
  readonly signal?: AbortSignal;
  registerDisposer?(name: string, dispose: AppDisposer): void;
  onBeforeDestroy?(handler: () => void | Promise<void>): () => void;
}

export async function createServer(scope: AppScope): Promise<Hono> {
  const distRoot = resolveDistRoot(scope);
  const env = readEnvFiles([path.join(distRoot, '.env')]);
  const browserBasePath = normalizeBasePath(scope.basePath);

  return createApp({
    appName: scope.appName ?? scope.id,
    basePath: '',
    browserBasePath,
    clientIndexPath: scope.clientDir
      ? path.join(scope.clientDir, 'index.html')
      : undefined,
    apiClientStoragePrefix:
      getScopeConfigString(scope.config, 'apiClientStoragePrefix') ??
      getEnvString(env, 'API_CLIENT_STORAGE_PREFIX'),
    apiClientStorageType:
      getScopeConfigString(scope.config, 'apiClientStorageType') ??
      getEnvString(env, 'API_CLIENT_STORAGE_TYPE'),
    apiClientShareToken:
      getScopeConfigBoolean(scope.config, 'apiClientShareToken') ??
      getEnvBoolean(env, 'API_CLIENT_SHARE_TOKEN'),
  });
}

export default createServer;

function getScopeConfigString(
  config: unknown,
  key: string,
): string | undefined {
  if (!config || typeof config !== 'object') {
    return undefined;
  }

  const value = (config as Record<string, unknown>)[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function getScopeConfigBoolean(
  config: unknown,
  key: string,
): boolean | undefined {
  if (!config || typeof config !== 'object') {
    return undefined;
  }

  const value = (config as Record<string, unknown>)[key];
  return typeof value === 'boolean' ? value : undefined;
}

function resolveDistRoot(scope: AppScope): string {
  if (scope.rootDir) {
    return path.join(scope.rootDir, 'dist');
  }

  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}
