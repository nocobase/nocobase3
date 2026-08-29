import { existsSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import type { MigrationSource, SeedSource } from '@nocobase/app-database';

import type { ApplicationConfig } from '../application/index.js';
import type { AppDatabaseConfig } from '../database/index.js';
import type {
  AppServerPlugin,
  AppServerPlugins,
  ResolvedAppPlugin,
  ResolvedAppServerPlugins,
} from './types.js';

const require = createRequire(import.meta.url);

export interface ResolveAppServerPluginsOptions {
  readonly defaultAppPackageName?: string;
}

export interface ResolvedAppPluginDatabaseConfig {
  readonly database: AppDatabaseConfig;
  readonly plugins: readonly ResolvedAppPlugin[];
}

export function resolveAppServerPlugins<
  TConfig extends ApplicationConfig = ApplicationConfig,
>(
  rootDir: string,
  serverPlugins: AppServerPlugins<TConfig>,
  options: ResolveAppServerPluginsOptions = {},
): ResolvedAppServerPlugins<TConfig> {
  const rootPackagePath = path.join(rootDir, 'package.json');
  const appPackagePath = existsSync(rootPackagePath)
    ? rootPackagePath
    : path.join(rootDir, 'dist', 'package.json');
  const appPackage = existsSync(appPackagePath) ? readJson(appPackagePath) : {};

  return {
    appPackageName:
      typeof appPackage.name === 'string'
        ? appPackage.name
        : (options.defaultAppPackageName ?? 'app'),
    plugins: serverPlugins.plugins.map((definition) => ({
      definition,
      metadata: resolvePlugin(rootDir, definition),
    })),
  };
}

export function resolveAppPluginDatabaseConfig<
  TConfig extends ApplicationConfig = ApplicationConfig,
>(
  rootDir: string,
  database: AppDatabaseConfig,
  serverPlugins: AppServerPlugins<TConfig>,
  options: ResolveAppServerPluginsOptions = {},
): ResolvedAppPluginDatabaseConfig {
  const resolved = resolveAppServerPlugins(rootDir, serverPlugins, options);
  return createAppPluginDatabaseConfig(database, resolved);
}

export function createAppPluginDatabaseConfig<
  TConfig extends ApplicationConfig = ApplicationConfig,
>(
  database: AppDatabaseConfig,
  resolved: ResolvedAppServerPlugins<TConfig>,
): ResolvedAppPluginDatabaseConfig {
  const plugins = resolved.plugins.map((plugin) => plugin.metadata);
  const appMigrationSource: MigrationSource = {
    packageName: resolved.appPackageName,
    directory: database.migrations.directory,
  };
  const appSeedSource: SeedSource | undefined = database.seeds
    ? {
        packageName: resolved.appPackageName,
        directory: database.seeds.directory,
      }
    : undefined;

  return {
    plugins,
    database: {
      ...database,
      migrations: {
        ...database.migrations,
        packageName: resolved.appPackageName,
        sources: [appMigrationSource, ...createPluginMigrationSources(plugins)],
      },
      seeds: database.seeds
        ? {
            ...database.seeds,
            packageName: resolved.appPackageName,
            sources: appSeedSource
              ? [appSeedSource, ...createPluginSeedSources(plugins)]
              : undefined,
          }
        : undefined,
    },
  };
}

export function createPluginMigrationSources(
  plugins: readonly ResolvedAppPlugin[],
): MigrationSource[] {
  return plugins.flatMap((plugin) =>
    plugin.migrationsDirectory
      ? [
          {
            packageName: plugin.packageName,
            directory: plugin.migrationsDirectory,
          },
        ]
      : [],
  );
}

export function createPluginSeedSources(
  plugins: readonly ResolvedAppPlugin[],
): SeedSource[] {
  return plugins.flatMap((plugin) =>
    plugin.seedsDirectory
      ? [
          {
            packageName: plugin.packageName,
            directory: plugin.seedsDirectory,
          },
        ]
      : [],
  );
}

export function createPluginJobLocations(
  plugins: readonly ResolvedAppPlugin[],
): string[] {
  return plugins.flatMap((plugin) => plugin.jobLocations);
}

function resolvePlugin<TConfig extends ApplicationConfig>(
  rootDir: string,
  definition: AppServerPlugin<TConfig>,
): ResolvedAppPlugin {
  const packageJsonPath = resolvePackageJson(rootDir, definition.packageName);
  const packageJson = readJson(packageJsonPath);
  const packageRoot = path.dirname(packageJsonPath);

  return {
    packageName: definition.packageName,
    version:
      typeof packageJson.version === 'string' ? packageJson.version : 'unknown',
    rootDir: packageRoot,
    migrationsDirectory: resolveOptionalPath(
      packageRoot,
      definition.database?.migrations,
    ),
    seedsDirectory: resolveOptionalPath(
      packageRoot,
      definition.database?.seeds,
    ),
    jobLocations: Object.freeze(
      (definition.queue?.jobs ?? []).map((configuredPath) =>
        createJobLocation(resolveRequiredPath(packageRoot, configuredPath)),
      ),
    ),
  };
}

function createJobLocation(resolvedPath: string): string {
  return statSync(resolvedPath).isDirectory()
    ? path.join(resolvedPath, '**/*.{ts,js,mts,mjs}')
    : resolvedPath;
}

function resolveOptionalPath(
  packageRoot: string,
  configuredPath: string | undefined,
): string | undefined {
  return configuredPath
    ? resolveRequiredPath(packageRoot, configuredPath)
    : undefined;
}

function resolveRequiredPath(
  packageRoot: string,
  configuredPath: string,
): string {
  validatePackagePath(configuredPath);
  const relativePath = configuredPath.slice(2);
  const candidates = [
    path.resolve(packageRoot, relativePath),
    path.resolve(packageRoot, 'dist', relativePath),
  ];
  const resolved = candidates.find((candidate) => existsSync(candidate));
  if (!resolved) {
    throw new Error(
      `Server plugin path "${configuredPath}" does not exist in ${packageRoot}.`,
    );
  }
  return resolved;
}

function validatePackagePath(configuredPath: string): void {
  if (
    !configuredPath.startsWith('./') ||
    configuredPath === './' ||
    configuredPath.includes('\\') ||
    configuredPath.split('/').includes('..')
  ) {
    throw new Error(
      `Server plugin path "${configuredPath}" must be a safe package-relative path beginning with "./".`,
    );
  }
}

function resolvePackageJson(rootDir: string, packageName: string): string {
  try {
    return require.resolve(`${packageName}/package.json`, {
      paths: [rootDir, path.join(rootDir, 'dist')],
    });
  } catch {
    throw new Error(
      `Configured server plugin "${packageName}" could not be resolved from ${rootDir}.`,
    );
  }
}

function readJson(filePath: string): Record<string, unknown> {
  return JSON.parse(readFileSync(filePath, 'utf8')) as Record<string, unknown>;
}
