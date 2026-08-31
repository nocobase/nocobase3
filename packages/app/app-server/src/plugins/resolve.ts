import { existsSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import type { MigrationSource, SeedSource } from '@nocobase/db';

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

export function resolveAppServerPlugins(
  rootDir: string,
  serverPlugins: AppServerPlugins,
  options: ResolveAppServerPluginsOptions = {},
): ResolvedAppServerPlugins {
  const appPackagePath = path.join(rootDir, 'package.json');
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

export function resolveAppPluginDatabaseConfig(
  rootDir: string,
  database: AppDatabaseConfig,
  serverPlugins: AppServerPlugins,
  options: ResolveAppServerPluginsOptions = {},
): ResolvedAppPluginDatabaseConfig {
  const resolved = resolveAppServerPlugins(rootDir, serverPlugins, options);
  return createAppPluginDatabaseConfig(database, resolved);
}

export function createAppPluginDatabaseConfig(
  database: AppDatabaseConfig,
  resolved: ResolvedAppServerPlugins,
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

function resolvePlugin(
  rootDir: string,
  definition: AppServerPlugin,
): ResolvedAppPlugin {
  const packageJsonPath = resolvePackageJson(rootDir, definition.packageName);
  const packageJson = readJson(packageJsonPath);
  const packageRoot = path.dirname(packageJsonPath);

  return {
    packageName: definition.packageName,
    version:
      typeof packageJson.version === 'string' ? packageJson.version : 'unknown',
    rootDir: packageRoot,
    migrationsDirectory: resolveOptionalDirectoryPath(
      packageRoot,
      definition.database?.migrations,
    ),
    seedsDirectory: resolveOptionalDirectoryPath(
      packageRoot,
      definition.database?.seeds,
    ),
    jobLocations: Object.freeze(
      (definition.queue?.jobs ?? []).flatMap((configuredPath) => {
        const resolvedPath = resolveOptionalDirectoryPath(
          packageRoot,
          configuredPath,
        );
        return resolvedPath ? [createJobLocation(resolvedPath)] : [];
      }),
    ),
  };
}

function createJobLocation(resolvedPath: string): string {
  return statSync(resolvedPath).isDirectory()
    ? path.join(resolvedPath, '**/*.{ts,js,mts,mjs}')
    : resolvedPath;
}

function resolveOptionalDirectoryPath(
  packageRoot: string,
  configuredPath: string | undefined,
): string | undefined {
  if (!configuredPath) {
    return undefined;
  }
  validatePackagePath(configuredPath);
  const relativePath = configuredPath.slice(2);
  const candidates = [
    path.resolve(packageRoot, relativePath),
    path.resolve(packageRoot, 'dist', relativePath),
  ];
  return candidates.find((candidate) => existsSync(candidate));
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
