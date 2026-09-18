import { assertNoQueueContribution } from './queue-contribution.js';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import type { MigrationSource, SeedSource } from '@nocobase/db';

import type { AppDatabaseTaskContributions } from '../database/index.js';
import type {
  AppServerPlugin,
  AppServerPlugins,
  ResolvedAppPlugin,
  ResolvedAppServerPlugins,
} from './types.js';

const require = createRequire(import.meta.url);

export interface ResolveAppServerPluginsOptions {
  readonly defaultAppPackageName?: string;
  /**
   * Prefer the application's compiled production dependency tree over workspace links.
   *
   * Standalone production builds carry their dependencies under `dist/node_modules`, while a source checkout may have
   * both that tree and root-level links to TypeScript sources. Callers that run the compiled runtime must opt in so
   * source development keeps resolving the workspace packages it is meant to watch.
   */
  readonly preferBuiltPackages?: boolean;
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
      metadata: resolvePlugin(
        rootDir,
        definition,
        options.preferBuiltPackages === true,
      ),
    })),
  };
}

/** The application identity and plugin task sources that database planning needs. */
export function createAppDatabaseTaskContributions(
  resolved: ResolvedAppServerPlugins,
): AppDatabaseTaskContributions {
  const plugins = resolved.plugins.map((plugin) => {
    // Direct Application.addServerPlugins callers may supply legacy JavaScript descriptors.
    assertNoQueueContribution(plugin.definition);
    return plugin.metadata;
  });
  return {
    appPackageName: resolved.appPackageName,
    migrations: createPluginMigrationSources(plugins),
    seeds: createPluginSeedSources(plugins),
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

function resolvePlugin(
  rootDir: string,
  definition: AppServerPlugin,
  preferBuiltPackages: boolean,
): ResolvedAppPlugin {
  assertNoQueueContribution(definition);
  const packageJsonPath = resolvePackageJson(
    rootDir,
    definition.packageName,
    preferBuiltPackages,
  );
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
  };
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

function resolvePackageJson(
  rootDir: string,
  packageName: string,
  preferBuiltPackages: boolean,
): string {
  try {
    return require.resolve(`${packageName}/package.json`, {
      // A built standalone app keeps its production dependency tree under `dist/node_modules`, while source
      // development intentionally resolves the workspace links from the application root.
      paths: preferBuiltPackages
        ? [path.join(rootDir, 'dist'), rootDir]
        : [rootDir, path.join(rootDir, 'dist')],
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
