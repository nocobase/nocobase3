import { readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

import type { MigrationSource, SeedSource } from '@nocobase/app-database';
import type {
  AppPluginProviderConstructor,
  AppPluginRoutesRegistrar,
} from '@nocobase/app-server-kit/plugins';

import type {
  AppPluginManifest,
  AppPluginRegistry,
  LoadedAppPluginProvider,
  LoadedAppPluginRoutes,
  ResolvedAppPlugin,
} from './types.js';
import type { AppConfig } from '../config/index.js';

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

export function createPluginJobLocations(
  plugins: readonly ResolvedAppPlugin[],
): string[] {
  return plugins.flatMap((plugin) =>
    plugin.enabled && plugin.jobsDirectory
      ? [path.join(plugin.jobsDirectory, '**/*.{ts,js,mts,mjs}')]
      : [],
  );
}

export async function loadPluginProviders(
  plugins: readonly ResolvedAppPlugin[],
): Promise<LoadedAppPluginProvider[]> {
  const enabled = plugins.flatMap((plugin) =>
    plugin.enabled && plugin.providerEntry
      ? [{ plugin, providerEntry: plugin.providerEntry }]
      : [],
  );

  return Promise.all(
    enabled.map(async ({ plugin, providerEntry }) => {
      const providerModule = (await import(
        pathToFileURL(providerEntry).href
      )) as {
        default?: unknown;
      };
      if (typeof providerModule.default !== 'function') {
        throw new Error(
          `Plugin "${plugin.packageName}" provider entry must default-export a ServiceProvider class.`,
        );
      }

      return {
        packageName: plugin.packageName,
        Provider:
          providerModule.default as AppPluginProviderConstructor<AppConfig>,
      };
    }),
  );
}

export async function loadPluginRoutes(
  plugins: readonly ResolvedAppPlugin[],
): Promise<LoadedAppPluginRoutes[]> {
  const enabled = plugins.flatMap((plugin) =>
    plugin.enabled && plugin.routesEntry
      ? [{ plugin, routesEntry: plugin.routesEntry }]
      : [],
  );

  return Promise.all(
    enabled.map(async ({ plugin, routesEntry }) => {
      const routeModule = (await import(pathToFileURL(routesEntry).href)) as {
        default?: unknown;
      };
      if (typeof routeModule.default !== 'function') {
        throw new Error(
          `Plugin "${plugin.packageName}" routes entry must default-export a function.`,
        );
      }

      return {
        packageName: plugin.packageName,
        registerRoutes: routeModule.default as AppPluginRoutesRegistrar,
      };
    }),
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
    jobsDirectory: resolveConventionDirectory(packageRoot, [
      'server/jobs',
      'dist/server/jobs',
    ]),
    providerEntry:
      resolveOptionalModuleFile(packageRoot, manifest.server) ??
      resolveConventionFile(packageRoot, [
        'server/provider.ts',
        'server/provider.js',
        'dist/server/provider.js',
        'dist/server/provider.mjs',
      ]),
    routesEntry: resolveConventionFile(packageRoot, [
      'server/routes/index.ts',
      'server/routes/index.js',
      'dist/server/routes/index.js',
      'dist/server/routes/index.mjs',
    ]),
    clientBootstrapEntry: resolveOptionalModuleFile(
      packageRoot,
      manifest.client?.bootstrap,
    ),
    clientRoutesEntry: resolveOptionalModuleFile(
      packageRoot,
      manifest.client?.routes,
    ),
    clientProvidersEntry: resolveOptionalModuleFile(
      packageRoot,
      manifest.client?.providers,
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

  const client = readClientManifest(value.client, packageName);

  return {
    server: serverEntryValue(value.server, packageName),
    client,
    database: database
      ? {
          migrations: stringValue(database.migrations),
          seeds: stringValue(database.seeds),
        }
      : undefined,
  };
}

function serverEntryValue(
  value: unknown,
  packageName: string,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(
      `Plugin package "${packageName}" server provider entry must be a non-empty string.`,
    );
  }
  if (
    !value.startsWith('./') ||
    value.includes('\\') ||
    value.split('/').includes('..') ||
    value === './'
  ) {
    throw new Error(
      `Plugin package "${packageName}" server provider entry must be a safe package subpath beginning with "./".`,
    );
  }
  return value;
}

function readClientManifest(
  value: unknown,
  packageName: string,
): AppPluginManifest['client'] {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === 'string') {
    return {
      bootstrap: clientEntryValue(value, packageName, 'bootstrap'),
    };
  }
  if (!isRecord(value)) {
    throw new Error(
      `Plugin package "${packageName}" must define client as a string or object.`,
    );
  }

  return {
    bootstrap: clientEntryValue(value.bootstrap, packageName, 'bootstrap'),
    routes: clientEntryValue(value.routes, packageName, 'routes'),
    providers: clientEntryValue(value.providers, packageName, 'providers'),
  };
}

function clientEntryValue(
  value: unknown,
  packageName: string,
  contribution: string,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(
      `Plugin package "${packageName}" client ${contribution} entry must be a non-empty string.`,
    );
  }
  if (
    !value.startsWith('./') ||
    value.includes('\\') ||
    value.split('/').includes('..') ||
    value === './'
  ) {
    throw new Error(
      `Plugin package "${packageName}" client ${contribution} entry must be a safe package subpath beginning with "./".`,
    );
  }
  return value;
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

function resolveConventionDirectory(
  packageRoot: string,
  candidates: readonly string[],
): string | undefined {
  return candidates
    .map((candidate) => path.resolve(packageRoot, candidate))
    .find((candidate) => existsSync(candidate));
}

function resolveConventionFile(
  packageRoot: string,
  candidates: readonly string[],
): string | undefined {
  return candidates
    .map((candidate) => path.resolve(packageRoot, candidate))
    .find((candidate) => existsSync(candidate));
}

function resolveOptionalModuleFile(
  packageRoot: string,
  entry: string | undefined,
): string | undefined {
  if (!entry) {
    return undefined;
  }

  const relativeEntry = entry.startsWith('./') ? entry.slice(2) : entry;
  const bases = [
    path.resolve(packageRoot, relativeEntry),
    path.resolve(packageRoot, 'dist', relativeEntry),
  ];
  const extensions = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.mts'];

  return bases
    .flatMap((base) => extensions.map((extension) => `${base}${extension}`))
    .find(isFile);
}

function isFile(candidate: string): boolean {
  return existsSync(candidate) && statSync(candidate).isFile();
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
