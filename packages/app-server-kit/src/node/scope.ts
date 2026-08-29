import path from 'node:path';

import { type EnvMap } from '../config/index.js';
import {
  normalizeBasePath,
  resolveAppNameFromBasePath,
} from '../support/index.js';
import { AppScopeLifecycle } from '../runtime/lifecycle.js';
import type { AppPathOptions, AppScope } from '../runtime/types.js';

export interface LoadStandaloneAppEnvOptions {
  readonly baseEnv?: EnvMap;
  readonly overrides?: EnvMap;
}

export function loadStandaloneAppEnv(
  options: LoadStandaloneAppEnvOptions,
): EnvMap {
  const baseEnv = options.baseEnv ?? process.env;
  return {
    ...baseEnv,
    ...options.overrides,
  };
}

export interface StandaloneAppScopeOptions {
  readonly id?: string;
  readonly appName: string;
  readonly basePath: string;
  readonly paths: AppPathOptions;
  readonly configPath?: string;
  readonly env: EnvMap;
  readonly abortReason?: unknown;
}

export interface CreateStandaloneScopeOptions {
  readonly rootDir?: string;
  readonly paths?: AppPathOptions;
  readonly appName?: string;
  readonly basePath?: string;
  readonly configPath?: string;
  /** Final environment overrides applied after process.env. */
  readonly env?: EnvMap;
  readonly abortReason?: unknown;
}

export interface ResolveStandaloneAppPathsOptions {
  readonly rootDir?: string;
  readonly paths?: AppPathOptions;
}

export class StandaloneAppScope extends AppScopeLifecycle implements AppScope {
  public readonly mode = 'standalone' as const;
  public readonly id: string;
  public readonly appName: string;
  public readonly basePath: string;
  public readonly paths: AppPathOptions;
  public readonly rootDir: string;
  public readonly dataDir: string | undefined;
  public readonly clientDir: string | undefined;
  public readonly configPath: string | undefined;
  public readonly env: EnvMap;

  public constructor(options: StandaloneAppScopeOptions) {
    super({ abortReason: options.abortReason });
    this.id = options.id ?? options.appName;
    this.appName = options.appName;
    this.basePath = options.basePath;
    this.paths = options.paths;
    this.rootDir = options.paths.rootDir;
    this.dataDir = options.paths.storageDir;
    this.clientDir = options.paths.clientDir;
    this.configPath = options.configPath;
    this.env = options.env;
  }
}

export function createStandaloneScope(
  options: CreateStandaloneScopeOptions,
): StandaloneAppScope {
  const paths = resolveStandaloneAppPaths(options);
  const env = loadStandaloneAppEnv({
    overrides: options.env,
  });
  const defaultAppName = 'main';
  const defaultBasePath = '/main';
  const basePath = normalizeBasePath(
    options.basePath ?? env.APP_BASE_PATH ?? defaultBasePath,
  );
  const appName =
    options.appName ?? resolveAppNameFromBasePath(basePath, defaultAppName);

  return new StandaloneAppScope({
    appName,
    basePath,
    paths,
    configPath: options.configPath,
    env,
    abortReason:
      options.abortReason ?? new Error('Standalone application closed.'),
  });
}

export function resolveStandaloneAppPaths(
  options: ResolveStandaloneAppPathsOptions,
): AppPathOptions {
  if (options.paths) {
    return options.paths;
  }

  if (!options.rootDir) {
    throw new Error(
      'Standalone scope requires options.rootDir or options.paths.',
    );
  }

  const rootDir = path.resolve(options.rootDir);
  const built = path.basename(rootDir) === 'dist';

  return {
    rootDir,
    serverDir: path.join(rootDir, 'server'),
    databaseDir: path.join(rootDir, 'database'),
    clientDir: path.join(rootDir, built ? 'client' : 'dist/client'),
    storageDir: path.join(rootDir, 'storage'),
  };
}
