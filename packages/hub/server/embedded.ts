import type { Hono } from 'hono';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createApp, joinBasePath, normalizeBasePath } from './app.js';
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
  const proxy = resolveApiProxyFromEnv(env);
  const authSecret =
    getScopeConfigString(scope.config, 'authSecret') ??
    getEnvString(env, 'AUTH_SECRET');
  const databasePath =
    getScopeConfigString(scope.config, 'hubDatabasePath') ??
    getEnvString(env, 'HUB_DATABASE_PATH');
  const releaseRoot =
    getScopeConfigString(scope.config, 'hubReleaseRoot') ??
    getEnvString(env, 'HUB_RELEASE_ROOT');
  const authBaseUrl =
    getScopeConfigString(scope.config, 'authBaseUrl') ??
    getEnvString(env, 'AUTH_BASE_URL');
  const hubEnabled =
    getScopeConfigBoolean(scope.config, 'hubEnabled') ??
    getEnvBoolean(env, 'HUB_ENABLED') ??
    Boolean(authSecret);

  const app = createApp({
    appName: scope.appName ?? scope.id,
    basePath: '',
    browserBasePath,
    browserApiUrl: joinBasePath(browserBasePath, '/api'),
    apiProxyPath: proxy?.path,
    clientIndexPath: scope.clientDir
      ? path.join(scope.clientDir, 'index.html')
      : undefined,
    nocoBaseApiUrl: proxy?.target,
    hub: hubEnabled,
    authSecret,
    authBaseUrl,
    databasePath,
    releaseRoot,
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
  let closePromise: Promise<void> | undefined;
  const close = (): Promise<void> =>
    (closePromise ??= app.close?.() ?? Promise.resolve());
  if (typeof scope.registerDisposer !== 'function') {
    await close();
    throw new Error('Hub embedded AppScope must provide registerDisposer().');
  }
  try {
    scope.registerDisposer('hub', close);
    await app.hubReady;
  } catch (error) {
    await close();
    throw error;
  }
  return app;
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

function resolveApiProxyFromEnv(
  env: Record<string, string>,
): { path: string; target: string } | undefined {
  const target = getEnvString(env, 'NOCOBASE_API_PROXY_TARGET');
  const rawPath = getEnvString(env, 'NOCOBASE_API_PROXY_PATH');
  if (!target || !rawPath) {
    return undefined;
  }
  let normalizedPath: string;
  try {
    normalizedPath = normalizeBasePath(new URL(rawPath).pathname);
  } catch {
    normalizedPath = normalizeBasePath(rawPath);
  }
  return { path: normalizedPath || '/', target };
}

function resolveDistRoot(scope: AppScope): string {
  if (scope.rootDir) {
    return path.join(scope.rootDir, 'dist');
  }

  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}
