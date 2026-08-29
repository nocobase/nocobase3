import path from 'node:path';

import { readEnvFiles, type EnvMap } from '../config/index.js';
import {
  normalizeBasePath,
  resolveAppNameFromBasePath,
} from '../support/index.js';
import { AppScopeLifecycle } from '../runtime/lifecycle.js';
import type { AppPathOptions, AppScope } from '../runtime/types.js';

export interface LoadStandaloneAppEnvOptions {
  readonly rootDir: string;
  readonly files?: readonly string[];
  readonly baseEnv?: EnvMap;
  readonly overrides?: EnvMap;
}

export function loadStandaloneAppEnv(
  options: LoadStandaloneAppEnvOptions,
): EnvMap {
  const baseEnv = options.baseEnv ?? process.env;
  const files = options.files ?? [
    path.join(options.rootDir, '.env'),
    path.join(options.rootDir, '.env.local'),
  ];

  return {
    ...readEnvFiles([...files], baseEnv),
    ...baseEnv,
    ...options.overrides,
  };
}

export interface StandaloneAppScopeOptions<TConfig = unknown> {
  readonly id?: string;
  readonly appName: string;
  readonly basePath: string;
  readonly paths: AppPathOptions;
  readonly env: EnvMap;
  readonly config?: TConfig;
  readonly abortReason?: unknown;
}

export interface CreateStandaloneScopeOptions<TConfig = unknown> {
  readonly rootDir?: string;
  readonly paths?: AppPathOptions;
  readonly appName?: string;
  readonly basePath?: string;
  readonly config?: TConfig;
  /** Final environment overrides applied after env files and process.env. */
  readonly env?: EnvMap;
  readonly abortReason?: unknown;
}

export interface ResolveStandaloneAppPathsOptions {
  readonly rootDir?: string;
  readonly paths?: AppPathOptions;
}

export class StandaloneAppScope<TConfig = unknown>
  extends AppScopeLifecycle
  implements AppScope<TConfig>
{
  public readonly mode = 'standalone' as const;
  public readonly id: string;
  public readonly appName: string;
  public readonly basePath: string;
  public readonly paths: AppPathOptions;
  public readonly rootDir: string;
  public readonly dataDir: string | undefined;
  public readonly clientDir: string | undefined;
  public readonly env: EnvMap;
  public readonly config: TConfig | undefined;

  public constructor(options: StandaloneAppScopeOptions<TConfig>) {
    super({ abortReason: options.abortReason });
    this.id = options.id ?? options.appName;
    this.appName = options.appName;
    this.basePath = options.basePath;
    this.paths = options.paths;
    this.rootDir = options.paths.rootDir;
    this.dataDir = options.paths.storageDir;
    this.clientDir = options.paths.clientDir;
    this.env = options.env;
    this.config = options.config;
  }
}

export function createStandaloneScope<TConfig = unknown>(
  options: CreateStandaloneScopeOptions<TConfig>,
): StandaloneAppScope<TConfig> {
  const paths = resolveStandaloneAppPaths(options);
  const env = loadStandaloneAppEnv({
    rootDir: paths.rootDir,
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
    env,
    config: options.config,
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
