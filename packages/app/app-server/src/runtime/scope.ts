import path from 'node:path';

import {
  createConfigPaths,
  type ConfigPaths,
  type EnvMap,
} from '../config/index.js';
import { normalizeBasePath, resolveAppName } from '../support/index.js';
import type { AppPathOptions, AppScope } from './types.js';

export interface ResolveAppRoutingOptions {
  readonly name: string;
  readonly publicBasePath: string;
  readonly internalBasePath?: string;
}

export interface ResolvedAppRouting {
  readonly name: string;
  readonly publicBasePath: string;
  readonly internalBasePath: string;
}

export interface ResolveAppScopeRuntimeOptions {
  readonly routing?: {
    readonly internalBasePath?: string;
  };
  readonly envOverrides?: EnvMap;
}

export interface ResolvedAppScopeRuntime {
  readonly mode: 'standalone' | 'embedded';
  readonly env: EnvMap;
  readonly paths: AppPathOptions;
  readonly routing: ResolvedAppRouting;
}

export function resolveAppScopeRuntime(
  scope: AppScope,
  options: ResolveAppScopeRuntimeOptions = {},
): ResolvedAppScopeRuntime {
  const paths = resolveAppScopePaths(scope);

  return {
    mode: scope.mode ?? 'embedded',
    env: resolveAppScopeEnv(scope, paths, options.envOverrides),
    paths,
    routing: resolveAppRouting({
      name: resolveAppName(scope.appName ?? scope.id),
      publicBasePath: scope.basePath,
      internalBasePath: options.routing?.internalBasePath,
    }),
  };
}

export function resolveAppScopePaths(scope: AppScope): AppPathOptions {
  if (scope.paths) {
    return scope.paths;
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

  throw new Error('Application scopes require scope.rootDir or scope.paths.');
}

export function resolveAppScopeEnv(
  scope: AppScope,
  _paths: AppPathOptions,
  overrides: EnvMap = {},
): EnvMap {
  return {
    ...(scope.env ?? (scope.mode === 'standalone' ? process.env : {})),
    ...overrides,
  };
}

export function createAppConfigPaths(paths: AppPathOptions): ConfigPaths {
  return createConfigPaths({
    rootDir: paths.rootDir,
    serverDir: paths.serverDir,
    databaseDir: paths.databaseDir,
    storageDir: paths.storageDir,
  });
}

export function resolveAppRouting(
  options: ResolveAppRoutingOptions,
): ResolvedAppRouting {
  const publicBasePath = normalizeBasePath(options.publicBasePath);
  const internalBasePath = normalizeBasePath(options.internalBasePath ?? '');

  return {
    name: resolveAppName(options.name),
    publicBasePath,
    internalBasePath,
  };
}
