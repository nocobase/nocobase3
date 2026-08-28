import path from 'node:path';

import {
  createConfigPaths,
  readEnvFiles,
  type ConfigPaths,
  type EnvMap,
} from '@nocobase/app-server-kit/config';
import {
  joinBasePath,
  normalizeBasePath,
  resolveAppName,
} from '@nocobase/app-server-kit/support';

import type { AppDisposer } from '../app-options.js';

export type { AppDisposer } from '../app-options.js';

export interface AppScope {
  readonly mode?: 'embedded' | 'standalone';
  readonly id: string;
  readonly appName?: string;
  readonly version?: number;
  readonly basePath: string;
  readonly assetsBasePath?: string;
  readonly clientDir?: string;
  /**
   * Deprecated. App servers should define app-local API routes under `/api`.
   */
  readonly apiBasePath?: string;
  readonly rootDir?: string;
  readonly dataDir?: string;
  readonly config?: unknown;
  /**
   * Optional fully resolved environment supplied by a host-owned scope. When
   * absent, createServer reads the app's env files. Explicit scope config
   * overrides either source.
   */
  readonly env?: EnvMap;
  /**
   * Optional fully resolved paths. Standalone scopes use this to preserve
   * source-vs-dist layouts without exposing a module URL to createServer().
   */
  readonly runtimePaths?: AppRuntimePathOptions;
  readonly signal?: AbortSignal;
  registerDisposer(name: string, dispose: AppDisposer): void;
  onBeforeDestroy?(handler: AppDisposer): () => void;
}

export interface AppRoutingOptions {
  name: string;
  publicBasePath: string;
  internalBasePath: string;
  internalApiProxyPath: string;
  publicApiUrl: string;
}

export interface AppRuntimePathOptions {
  rootDir: string;
  serverDir: string;
  databaseDir?: string;
  clientDir?: string;
  storageDir?: string;
}

export interface ResolvedAppRuntimeOptions {
  mode: 'standalone' | 'embedded';
  env: EnvMap;
  paths: AppRuntimePathOptions;
  routing: AppRoutingOptions;
}

export function resolveAppRuntimeOptions(
  scope: AppScope,
): ResolvedAppRuntimeOptions {
  const paths = resolveAppPaths(scope);
  const configPaths = createRuntimeConfigPaths(paths);
  const env = {
    ...(scope.env ??
      readEnvFiles([configPaths.root('.env'), configPaths.root('.env.local')])),
    ...createScopeEnv(scope),
  };
  return {
    mode: scope.mode ?? 'embedded',
    env,
    paths: {
      rootDir: paths.rootDir,
      serverDir: paths.serverDir,
      databaseDir: paths.databaseDir,
      clientDir: paths.clientDir,
      storageDir: paths.storageDir,
    },
    routing: createAppRouting({
      name: resolveAppName(scope.appName ?? scope.id),
      publicBasePath: scope.basePath,
    }),
  };
}

export function createRuntimeConfigPaths(
  paths: AppRuntimePathOptions,
): ConfigPaths {
  return createConfigPaths({
    rootDir: paths.rootDir,
    serverDir: paths.serverDir,
    databaseDir: paths.databaseDir,
    storageDir: paths.storageDir,
  });
}

export function createAppRouting(options: {
  name: string;
  publicBasePath: string;
}): AppRoutingOptions {
  const publicBasePath = normalizeBasePath(options.publicBasePath);
  const internalApiProxyPath = '/v2/api';

  return {
    name: resolveAppName(options.name),
    publicBasePath,
    internalBasePath: '',
    internalApiProxyPath,
    publicApiUrl: joinBasePath(publicBasePath, internalApiProxyPath),
  };
}

function resolveAppPaths(scope: AppScope): AppRuntimePathOptions {
  if (scope.runtimePaths) {
    return scope.runtimePaths;
  }

  if (scope.rootDir) {
    const rootDir = path.resolve(scope.rootDir);
    const distRoot = path.join(rootDir, 'dist');

    return {
      rootDir,
      serverDir: path.join(distRoot, 'server'),
      databaseDir: path.join(distRoot, 'database'),
      clientDir: scope.clientDir ?? path.join(distRoot, 'client'),
      storageDir: scope.dataDir ?? path.join(rootDir, 'data'),
    };
  }

  throw new Error(
    'Application scopes require scope.rootDir or scope.runtimePaths.',
  );
}

function createScopeEnv(scope: AppScope): EnvMap {
  return removeUndefinedValues({
    APP_PUBLIC_ORIGIN: getScopeConfigString(scope.config, 'publicOrigin'),
    NOCOBASE_API_PROXY_TARGET: getScopeConfigString(
      scope.config,
      'nocoBaseApiUrl',
    ),
    API_CLIENT_STORAGE_PREFIX: getScopeConfigString(
      scope.config,
      'apiClientStoragePrefix',
    ),
    API_CLIENT_STORAGE_TYPE: getScopeConfigString(
      scope.config,
      'apiClientStorageType',
    ),
    API_CLIENT_SHARE_TOKEN: getScopeConfigBoolean(
      scope.config,
      'apiClientShareToken',
    )?.toString(),
    AUTH_SECRET: getScopeConfigString(scope.config, 'authSecret'),
  });
}

function removeUndefinedValues(values: EnvMap): EnvMap {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== undefined),
  );
}

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
