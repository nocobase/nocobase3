import type { Hono } from 'hono';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createApp, joinBasePath, normalizeBasePath } from './app.js';
import {
  getEnvBoolean,
  getEnvString,
  readEnvFiles,
} from '@nocobase/app-server-kit/config';
import { resolvePublicAuthBaseUrl } from '@nocobase/app-server-kit/support';
import { createCrmRuntime } from './runtime.js';
import { resolvePersistentAuthSecret } from './secret.js';

export type AppDisposer = () => void | Promise<void>;

export interface AppRuntimeResource {
  id: string;
  kind: string;
  name: string;
  status: 'applying' | 'active' | 'restart-required' | 'error';
  provider: string;
  updatedAt: string;
  details?: Record<string, string | number | boolean | null>;
  error?: { code: string; message: string } | null;
}

export interface AppScope {
  readonly id: string;
  readonly appName?: string;
  readonly version?: number;
  readonly releaseId?: string | null;
  readonly basePath: string;
  readonly rootDir?: string;
  readonly clientDir?: string;
  readonly dataDir?: string;
  readonly config?: unknown;
  readonly signal?: AbortSignal;
  reportRuntimeResource?(resource: AppRuntimeResource): void;
  registerDisposer?(name: string, dispose: AppDisposer): void;
  onBeforeDestroy?(handler: () => void | Promise<void>): () => void;
}

export async function createServer(scope: AppScope): Promise<Hono> {
  const apiProxyPath = '/api';
  const distRoot = resolveDistRoot(scope);
  const env = {
    ...readEnvFiles([path.join(distRoot, '.env')]),
    ...process.env,
  };
  const browserBasePath = normalizeBasePath(scope.basePath);
  const dataDir = scope.dataDir ?? path.join(distRoot, 'data');
  const serverDir = path.dirname(fileURLToPath(import.meta.url));
  const crmRuntime = createCrmRuntime({
    appName: scope.appName ?? scope.id,
    authBasePath: '/api/auth',
    authSecret: resolvePersistentAuthSecret(
      dataDir,
      getScopeConfigString(scope.config, 'authSecret') ??
        getEnvString(env, 'AUTH_SECRET'),
    ),
    baseURL:
      getScopeConfigString(scope.config, 'authBaseUrl') ??
      getEnvString(env, 'NOCOBASE_AUTH_URL') ??
      resolvePublicAuthBaseUrl(getEnvString(env, 'APP_HOST_PUBLIC_URL')),
    databasePath:
      getScopeConfigString(scope.config, 'databasePath') ??
      getEnvString(env, 'CRM_DATABASE_PATH') ??
      path.join(dataDir, 'crm.sqlite'),
    migrationsDirectory: path.join(serverDir, 'migrations'),
    seedPath: resolveSeedPath(serverDir),
    publicBasePath: browserBasePath,
    allowAdditionalSignUp:
      getScopeConfigBoolean(scope.config, 'allowAdditionalSignUp') ??
      getEnvBoolean(env, 'CRM_ALLOW_ADDITIONAL_SIGN_UP'),
  });
  const databaseResource = await crmRuntime.databaseStatus();
  scope.registerDisposer?.('crm-runtime', () => crmRuntime.close());
  scope.reportRuntimeResource?.(databaseResource);
  if (databaseResource.status === 'error') {
    throw new Error('CRM database failed its startup check.');
  }

  return createApp({
    appName: scope.appName ?? scope.id,
    basePath: '',
    browserBasePath,
    browserApiUrl: joinBasePath(browserBasePath, '/api'),
    apiProxyPath,
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
    releaseId: scope.releaseId,
    crmRuntime,
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

function resolveSeedPath(serverDir: string): string {
  const bundledSeed = path.join(serverDir, 'seed', 'demo-data.json');
  return existsSync(bundledSeed)
    ? bundledSeed
    : path.resolve(serverDir, '../nocobase/seed/demo-data.json');
}
