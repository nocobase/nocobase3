import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

import type { MigrationSource, SeedSource } from '@nocobase/database';

import type {
  AppPluginManifest,
  AppPluginRegistry,
  ResolvedAppPlugin,
} from './types.js';

const require = createRequire(import.meta.url);
const APP_PLUGIN_PACKAGE_PATTERN = /^@nocobase\/app-plugin-[a-z0-9][a-z0-9-]*$/;

export interface ResolvedAppPlugins {
  appPackageName: string;
  plugins: ResolvedAppPlugin[];
}

export function resolveAppPlugins(rootDir: string): ResolvedAppPlugins {
  const appPackagePath = path.join(rootDir, 'package.json');
  const packageJson = existsSync(appPackagePath)
    ? (readJson(appPackagePath) as AppPackageJson)
    : {};
  const registry = readPluginRegistry(packageJson.nocobase?.plugins);
  const plugins = Object.entries(registry).map(([packageName, registration]) =>
    resolvePlugin(rootDir, packageName, registration.enabled),
  );

  return {
    appPackageName:
      typeof packageJson.name === 'string'
        ? packageJson.name
        : '@nocobase/app-template-default',
    plugins,
  };
}

export function createPluginMigrationSources(
  plugins: readonly ResolvedAppPlugin[],
): MigrationSource[] {
  return plugins.flatMap((plugin) =>
    plugin.enabled && plugin.migrationsDirectory
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
    plugin.enabled && plugin.seedsDirectory
      ? [
          {
            packageName: plugin.packageName,
            directory: plugin.seedsDirectory,
          },
        ]
      : [],
  );
}

interface AppPackageJson {
  name?: unknown;
  nocobase?: {
    plugins?: unknown;
  };
}

function readPluginRegistry(value: unknown): AppPluginRegistry {
  if (value === undefined) {
    return {};
  }

  if (!isRecord(value)) {
    throw new Error('The nocobase.plugins registry must be an object.');
  }

  const registry: AppPluginRegistry = {};
  for (const [packageName, registration] of Object.entries(value)) {
    if (!APP_PLUGIN_PACKAGE_PATTERN.test(packageName)) {
      throw new Error(
        `Plugin package "${packageName}" must match @nocobase/app-plugin-<name>.`,
      );
    }

    if (!isRecord(registration) || typeof registration.enabled !== 'boolean') {
      throw new Error(
        `Plugin registration "${packageName}" must define enabled as a boolean.`,
      );
    }

    registry[packageName] = { enabled: registration.enabled };
  }

  return registry;
}

function resolvePlugin(
  rootDir: string,
  packageName: string,
  enabled: boolean,
): ResolvedAppPlugin {
  const packageJsonPath = resolvePackageJson(rootDir, packageName);
  const packageJson = readJson(packageJsonPath) as PluginPackageJson;
  const packageRoot = path.dirname(packageJsonPath);
  const manifest = readPluginManifest(
    packageJson.nocobase?.plugin,
    packageName,
  );

  return {
    packageName,
    version:
      typeof packageJson.version === 'string' ? packageJson.version : 'unknown',
    enabled,
    rootDir: packageRoot,
    manifest,
    migrationsDirectory: resolveOptionalDirectory(
      packageRoot,
      manifest.database?.migrations,
    ),
    seedsDirectory: resolveOptionalDirectory(
      packageRoot,
      manifest.database?.seeds,
    ),
  };
}

interface PluginPackageJson {
  version?: unknown;
  nocobase?: {
    plugin?: unknown;
  };
}

function readPluginManifest(
  value: unknown,
  packageName: string,
): AppPluginManifest {
  if (value === undefined) {
    return {};
  }

  if (!isRecord(value)) {
    throw new Error(
      `Plugin package "${packageName}" must define nocobase.plugin as an object.`,
    );
  }

  const database = value.database;
  if (database !== undefined && !isRecord(database)) {
    throw new Error(
      `Plugin package "${packageName}" must define database as an object.`,
    );
  }

  return {
    server: stringValue(value.server),
    client: stringValue(value.client),
    database: database
      ? {
          migrations: stringValue(database.migrations),
          seeds: stringValue(database.seeds),
        }
      : undefined,
  };
}

function resolveOptionalDirectory(
  packageRoot: string,
  directory: string | undefined,
): string | undefined {
  if (!directory) {
    return undefined;
  }

  const resolved = path.resolve(packageRoot, directory);
  if (existsSync(resolved)) {
    return resolved;
  }

  const distDirectory = path.resolve(packageRoot, 'dist', directory);
  if (existsSync(distDirectory)) {
    return distDirectory;
  }

  return resolved;
}

function resolvePackageJson(rootDir: string, packageName: string): string {
  try {
    return require.resolve(`${packageName}/package.json`, {
      paths: [rootDir, path.join(rootDir, 'dist')],
    });
  } catch {
    throw new Error(
      `Configured plugin "${packageName}" could not be resolved from ${rootDir}.`,
    );
  }
}

function readJson(filePath: string): Record<string, unknown> {
  return JSON.parse(readFileSync(filePath, 'utf8')) as Record<string, unknown>;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
