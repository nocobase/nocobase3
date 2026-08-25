import type { Hono } from 'hono';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getEnvString, readEnvFiles } from '@nocobase/app-server-kit/config';
import { resolvePublicAuthBaseUrl } from '@nocobase/app-server-kit/support';

import { createApp, joinBasePath, normalizeBasePath } from './app.js';
import { createOrdersRuntime } from './runtime.js';
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
  readonly displayName?: string;
  readonly releaseId?: string | null;
  readonly basePath: string;
  readonly rootDir?: string;
  readonly clientDir?: string;
  readonly dataDir?: string;
  readonly config?: unknown;
  reportRuntimeResource?(resource: AppRuntimeResource): void;
  registerDisposer?(name: string, dispose: AppDisposer): void;
}

export async function createServer(scope: AppScope): Promise<Hono> {
  const distRoot = scope.rootDir
    ? path.join(scope.rootDir, 'dist')
    : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const env = {
    ...readEnvFiles([path.join(distRoot, '.env')]),
    ...process.env,
  };
  const browserBasePath = normalizeBasePath(scope.basePath);
  const dataDir = scope.dataDir ?? path.join(distRoot, 'data');
  const serverDir = path.dirname(fileURLToPath(import.meta.url));
  const runtime = createOrdersRuntime({
    appName: scope.appName ?? scope.id,
    authBasePath: '/api/auth',
    authSecret: resolvePersistentAuthSecret(
      dataDir,
      getConfigString(scope.config, 'authSecret') ??
        getEnvString(env, 'AUTH_SECRET'),
    ),
    baseURL:
      getConfigString(scope.config, 'authBaseUrl') ??
      getEnvString(env, 'NOCOBASE_AUTH_URL') ??
      resolvePublicAuthBaseUrl(getEnvString(env, 'APP_HOST_PUBLIC_URL')),
    databasePath:
      getConfigString(scope.config, 'databasePath') ??
      getEnvString(env, 'ORDERS_DATABASE_PATH') ??
      path.join(dataDir, 'orders.sqlite'),
    migrationsDirectory: path.join(serverDir, 'migrations'),
    seedsDirectory: path.join(serverDir, 'seed'),
    publicBasePath: browserBasePath,
  });
  const resource = await runtime.databaseStatus();
  scope.registerDisposer?.('orders-runtime', () => runtime.close());
  scope.reportRuntimeResource?.(resource);
  if (resource.status === 'error')
    throw new Error('Orders database failed its startup check.');
  return createApp({
    appName: scope.appName ?? scope.id,
    basePath: '',
    browserBasePath,
    browserApiUrl: joinBasePath(browserBasePath, '/api'),
    apiProxyPath: '/api',
    clientIndexPath: scope.clientDir
      ? path.join(scope.clientDir, 'index.html')
      : undefined,
    releaseId: scope.releaseId,
    ordersRuntime: runtime,
  });
}

export default createServer;

function getConfigString(config: unknown, key: string): string | undefined {
  if (!config || typeof config !== 'object') return undefined;
  const value = (config as Record<string, unknown>)[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
