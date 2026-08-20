import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readEnvFiles, type EnvMap } from '@nocobase/app-server/config';
import { joinBasePath, normalizeBasePath, resolveAppName, resolveAppNameFromBasePath } from '@nocobase/app-server/support';

export type AppDisposer = () => void | Promise<void>;

export interface AppScope {
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
  readonly signal?: AbortSignal;
  registerDisposer?(name: string, dispose: AppDisposer): void;
  onBeforeDestroy?(handler: () => void | Promise<void>): () => void;
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
  clientDir?: string;
  storageDir?: string;
}

export interface ResolvedAppRuntimeOptions {
  mode: 'standalone' | 'embedded';
  env: EnvMap;
  paths: AppRuntimePathOptions;
  routing: AppRoutingOptions;
}

interface EmbeddedPathOptions extends AppRuntimePathOptions {
  distRoot: string;
}

export function resolveStandaloneRuntimeOptions(moduleUrl: string): ResolvedAppRuntimeOptions {
  const serverDir = getModuleDir(moduleUrl);
  const rootDir = path.resolve(serverDir, '..');
  const env = loadStandaloneEnv(rootDir);
  const publicBasePath = stringFromEnv(env, 'APP_BASE_PATH') ?? '/app-template-default';
  return {
    mode: 'standalone',
    env,
    paths: {
      rootDir,
      serverDir,
    },
    routing: createAppRouting({
      name: resolveAppNameFromBasePath(publicBasePath, 'app-template-default'),
      publicBasePath,
    }),
  };
}

export function resolveEmbeddedRuntimeOptions(scope: AppScope, moduleUrl: string): ResolvedAppRuntimeOptions {
  const paths = resolveEmbeddedPaths(scope, moduleUrl);
  const env = {
    ...readEnvFiles([path.join(paths.distRoot, '.env')]),
    ...createScopeEnv(scope),
  };
  return {
    mode: 'embedded',
    env,
    paths: {
      rootDir: paths.rootDir,
      serverDir: paths.serverDir,
      clientDir: paths.clientDir,
      storageDir: paths.storageDir,
    },
    routing: createAppRouting({
      name: resolveAppName(scope.appName ?? scope.id),
      publicBasePath: scope.basePath,
    }),
  };
}

export function createAppRouting(options: { name: string; publicBasePath: string }): AppRoutingOptions {
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

function loadStandaloneEnv(rootDir: string): EnvMap {
  const envFiles = [path.join(rootDir, '.env'), path.join(rootDir, '.env.local')];
  return {
    ...readEnvFiles(envFiles, process.env),
    ...process.env,
  };
}

function resolveEmbeddedPaths(scope: AppScope, moduleUrl: string): EmbeddedPathOptions {
  if (scope.rootDir) {
    const rootDir = path.resolve(scope.rootDir);
    const distRoot = path.join(rootDir, 'dist');

    return {
      rootDir,
      distRoot,
      serverDir: path.join(distRoot, 'server'),
      clientDir: scope.clientDir ?? path.join(distRoot, 'client'),
      storageDir: scope.dataDir ?? path.join(rootDir, 'data'),
    };
  }

  const serverDir = getModuleDir(moduleUrl);
  const moduleRoot = path.resolve(serverDir, '..');
  const distRoot = path.basename(moduleRoot) === 'dist' ? moduleRoot : path.join(moduleRoot, 'dist');

  return {
    rootDir: moduleRoot,
    distRoot,
    serverDir,
    clientDir: scope.clientDir ?? path.join(distRoot, 'client'),
    storageDir: scope.dataDir,
  };
}

function createScopeEnv(scope: AppScope): EnvMap {
  return removeUndefinedValues({
    NOCOBASE_API_PROXY_TARGET: getScopeConfigString(scope.config, 'nocoBaseApiUrl'),
    API_CLIENT_STORAGE_PREFIX: getScopeConfigString(scope.config, 'apiClientStoragePrefix'),
    API_CLIENT_STORAGE_TYPE: getScopeConfigString(scope.config, 'apiClientStorageType'),
    API_CLIENT_SHARE_TOKEN: getScopeConfigBoolean(scope.config, 'apiClientShareToken')?.toString(),
    AUTH_SECRET: getScopeConfigString(scope.config, 'authSecret'),
  });
}

function removeUndefinedValues(values: EnvMap): EnvMap {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined));
}

function getScopeConfigString(config: unknown, key: string): string | undefined {
  if (!config || typeof config !== 'object') {
    return undefined;
  }

  const value = (config as Record<string, unknown>)[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function getScopeConfigBoolean(config: unknown, key: string): boolean | undefined {
  if (!config || typeof config !== 'object') {
    return undefined;
  }

  const value = (config as Record<string, unknown>)[key];
  return typeof value === 'boolean' ? value : undefined;
}

function stringFromEnv(env: EnvMap, key: string): string | undefined {
  const value = env[key];
  return typeof value === 'string' ? value : undefined;
}

function getModuleDir(moduleUrl: string): string {
  return path.dirname(fileURLToPath(moduleUrl));
}
