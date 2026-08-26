import type { Hono } from 'hono';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createApp, joinBasePath, normalizeBasePath } from './app.js';
import {
  getEnvBoolean,
  getEnvString,
  readEnvFiles,
} from '@nocobase/app-server-kit/config';
import { createReleaseManagement } from '@nocobase/hub-release-management/server';
import { createSettingsManagement } from './settings/index.js';
import { createNativeAuthRuntime } from './native-auth/index.js';

export type AppDisposer = () => void | Promise<void>;

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
  registerDisposer?(name: string, dispose: AppDisposer): void;
  onBeforeDestroy?(handler: () => void | Promise<void>): () => void;
}

export async function createServer(scope: AppScope): Promise<Hono> {
  const apiProxyPath = '/v2/api';
  const distRoot = resolveDistRoot(scope);
  const env = readEnvFiles([path.join(distRoot, '.env')]);
  const browserBasePath = normalizeBasePath(scope.basePath);
  const nocoBaseApiUrl =
    getScopeConfigString(scope.config, 'nocoBaseApiUrl') ??
    getEnvString(env, 'NOCOBASE_API_PROXY_TARGET');
  const releaseEnv = { ...env, ...process.env };
  const dataDir = scope.dataDir ?? path.join(distRoot, 'data');
  const nativeAuth = createNativeAuthRuntime({
    appName: scope.appName ?? scope.id,
    authBasePath: '/api/auth',
    authSecret: resolveEmbeddedAuthSecret(scope, releaseEnv),
    baseURL: resolveEmbeddedAuthBaseUrl(scope, releaseEnv),
    databasePath:
      getEnvString(releaseEnv, 'HUB_DATABASE_PATH') ??
      path.join(dataDir, `${scope.id}.sqlite`),
    migrationsDirectory: path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      'migrations',
    ),
    publicBasePath: browserBasePath,
  });
  await nativeAuth.ready();
  scope.registerDisposer?.('hub-native-auth', () => nativeAuth.close());
  const adminEmails = parseList(getEnvString(releaseEnv, 'HUB_ADMIN_EMAILS'));
  const releaseManagement = createReleaseManagement({
    appHostUrl: resolveAppHostUrl(releaseEnv),
    appHostControlToken: getEnvString(releaseEnv, 'APP_HOST_CONTROL_TOKEN'),
    nativeAuth,
    database: nativeAuth.database,
    adminEmails,
    nocoBaseApiUrl,
    auditAccessToken: getEnvString(releaseEnv, 'HUB_RELEASE_AUDIT_TOKEN'),
    auditRole: getEnvString(releaseEnv, 'HUB_RELEASE_AUDIT_ROLE'),
    auditCollection: getEnvString(releaseEnv, 'HUB_RELEASE_AUDIT_COLLECTION'),
    storePath:
      getEnvString(releaseEnv, 'HUB_RELEASE_STORE_PATH') ??
      path.join(dataDir, 'release-management.json'),
    allowedRoles: parseRoles(
      getEnvString(releaseEnv, 'HUB_RELEASE_MANAGER_ROLES'),
    ),
  });
  const settingsManagement = createSettingsManagement({
    storePath:
      getEnvString(releaseEnv, 'HUB_SETTINGS_STORE_PATH') ??
      path.join(dataDir, 'settings.json'),
    encryptionKey: getEnvString(releaseEnv, 'HUB_SETTINGS_ENCRYPTION_KEY'),
    nativeAuth,
    database: nativeAuth.database,
    adminEmails,
    nocoBaseApiUrl,
    allowedRoles: parseRoles(
      getEnvString(releaseEnv, 'HUB_SETTINGS_MANAGER_ROLES') ??
        getEnvString(releaseEnv, 'HUB_RELEASE_MANAGER_ROLES'),
    ),
  });

  return createApp({
    appName: scope.appName ?? scope.id,
    basePath: '',
    browserBasePath,
    browserApiUrl: joinBasePath(browserBasePath, '/api'),
    apiProxyPath,
    clientIndexPath: scope.clientDir
      ? path.join(scope.clientDir, 'index.html')
      : undefined,
    nocoBaseApiUrl,
    apiClientStoragePrefix:
      getScopeConfigString(scope.config, 'apiClientStoragePrefix') ??
      getEnvString(env, 'API_CLIENT_STORAGE_PREFIX'),
    apiClientStorageType:
      getScopeConfigString(scope.config, 'apiClientStorageType') ??
      getEnvString(env, 'API_CLIENT_STORAGE_TYPE'),
    apiClientShareToken:
      getScopeConfigBoolean(scope.config, 'apiClientShareToken') ??
      getEnvBoolean(env, 'API_CLIENT_SHARE_TOKEN'),
    nativeAuth,
    appManagement: releaseManagement.apps,
    releaseManagement,
    settings: { ...settingsManagement, defaultAppId: scope.id },
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

function resolveAppHostUrl(env: Record<string, string | undefined>): string {
  return (
    getEnvString(env, 'APP_HOST_CONTROL_URL') ??
    `http://127.0.0.1:${getEnvString(env, 'APP_HOST_PORT') ?? '3000'}`
  );
}

function parseRoles(value: string | undefined): string[] | undefined {
  const roles = value
    ?.split(',')
    .map((role) => role.trim())
    .filter(Boolean);
  return roles?.length ? roles : undefined;
}

function parseList(value: string | undefined): string[] | undefined {
  const items = value
    ?.split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return items?.length ? items : undefined;
}

function resolveEmbeddedAuthSecret(
  scope: AppScope,
  env: Record<string, string | undefined>,
): string {
  const secret =
    getScopeConfigString(scope.config, 'authSecret') ??
    getEnvString(env, 'AUTH_SECRET');
  if (!secret) {
    if (getEnvString(env, 'NODE_ENV') === 'production') {
      throw new Error('Embedded Hub requires authSecret or AUTH_SECRET.');
    }
    return `nocobase3-embedded-${scope.id}-development-only-secret`;
  }
  return secret;
}

function resolveEmbeddedAuthBaseUrl(
  scope: AppScope,
  env: Record<string, string | undefined>,
): string | undefined {
  const baseURL =
    getScopeConfigString(scope.config, 'authBaseUrl') ??
    getEnvString(env, 'NOCOBASE_AUTH_URL');
  if (!baseURL && getEnvString(env, 'NODE_ENV') === 'production') {
    throw new Error('Embedded Hub requires authBaseUrl or NOCOBASE_AUTH_URL.');
  }
  return baseURL;
}
