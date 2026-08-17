/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type {
  CreateAppDefinitionOptions,
  AppFactory,
  AppBackendKind,
  AppClientReference,
  AppDefinition,
  AppIsolation,
  AppResourcePolicy,
  AppServerReference,
  AppTier,
} from './app-types.ts';
import type { AppRuntimeRegistry } from './app-registry.ts';

export interface DirectoryAppCatalogOptions {
  appsDir?: string;
}

interface AppPackageJson {
  name?: string;
  version?: string;
  app?: {
    enabled?: boolean;
    appName?: string;
    backend?: AppBackendKind;
    configVersion?: string;
    isolation?: AppIsolation;
    tier?: AppTier;
    version?: string;
    healthPath?: string;
    resourcePolicy?: AppResourcePolicy;
    config?: unknown;
  };
}

type AppModule = Record<string, unknown>;
type DynamicImport = (specifier: string) => Promise<AppModule>;

export interface AppCatalogSyncResult {
  registered: AppDefinition[];
  updated: AppDefinition[];
  unchanged: AppDefinition[];
}

const SERVER_ENTRYPOINT_CANDIDATES = ['dist/server/embedded.js'];
const CLIENT_DIR_CANDIDATES = ['dist/client'];

export class DirectoryAppCatalog {
  readonly appsDir: string;

  constructor(options: DirectoryAppCatalogOptions = {}) {
    this.appsDir = path.resolve(options.appsDir ?? defaultAppsDir());
  }

  async discover(): Promise<AppDefinition[]> {
    const entries = await readDirectories(this.appsDir);
    const definitions: AppDefinition[] = [];

    for (const entry of entries) {
      if (!isValidAppSegment(entry.name)) {
        continue;
      }

      const rootDir = path.join(this.appsDir, entry.name);
      const packageJson = await readAppPackage(rootDir);
      const directDefinition = await this.createDefinition({
        rootDir,
        packageJson,
        appName: entry.name,
      });

      if (directDefinition) {
        definitions.push(directDefinition);
      }
    }

    return definitions.sort((a, b) => a.id.localeCompare(b.id));
  }

  async registerDiscovered(registry: AppRuntimeRegistry): Promise<AppDefinition[]> {
    const result = await this.syncDiscovered(registry);
    return result.registered;
  }

  async syncDiscovered(registry: AppRuntimeRegistry): Promise<AppCatalogSyncResult> {
    const definitions = await this.discover();
    const result: AppCatalogSyncResult = {
      registered: [],
      updated: [],
      unchanged: [],
    };

    for (const definition of definitions) {
      if (registry.has(definition.id)) {
        const current = registry.definition(definition.id);
        if (current && definitionsEquivalent(current, definition)) {
          result.unchanged.push(current);
          continue;
        }

        result.updated.push(await registry.updateDefinition(definition.id, definitionToOptions(definition)));
        continue;
      }

      result.registered.push(await registry.register(definition.id, definitionToOptions(definition)));
    }

    return result;
  }

  async resolveFactory(definition: AppDefinition): Promise<AppFactory> {
    if (!definition.rootDir) {
      throw new Error(`App ${definition.id} has no rootDir and cannot be loaded from the directory catalog`);
    }

    if (!definition.server) {
      throw new Error(`App ${definition.id} has no server entrypoint`);
    }

    const entrypoint = definition.server.entrypoint;
    const absoluteEntrypoint = path.resolve(definition.server.rootDir, entrypoint);
    assertInside(definition.server.rootDir, absoluteEntrypoint);

    await stat(absoluteEntrypoint);

    const module = await importModule(pathToFileURL(absoluteEntrypoint).href);
    const factory = module.createServer ?? module.createApp ?? module.default ?? module.createExampleApp ?? module.createApi;

    if (typeof factory === 'function') {
      return factory as AppFactory;
    }

    throw new Error(
      `App ${definition.id} must export createServer(scope), createApp(scope), default(scope), createExampleApp(scope), or createApi(scope)`,
    );
  }

  private async createDefinition(options: {
    rootDir: string;
    packageJson: AppPackageJson | null;
    appName: string;
  }): Promise<AppDefinition | null> {
    const { rootDir, packageJson } = options;
    const appName = options.appName;
    const client = await resolveClient(rootDir);
    const server = await resolveServer(rootDir);

    if (!server) {
      return null;
    }

    if (server) {
      const absoluteEntrypoint = path.resolve(server.rootDir, server.entrypoint);
      assertInside(rootDir, absoluteEntrypoint);
    }

    const id = appName;
    const basePath = `/${appName}`;
    const codeVersion = packageJson?.app?.version ?? packageJson?.version ?? 'local';

    return {
      id,
      appName,
      basePath,
      enabled: packageJson?.app?.enabled ?? true,
      backend: packageJson?.app?.backend ?? packageJson?.app?.isolation ?? 'in-process',
      configVersion: packageJson?.app?.configVersion ?? 'v1',
      isolation: packageJson?.app?.isolation ?? 'in-process',
      tier: packageJson?.app?.tier ?? 'warm',
      desiredVersion: codeVersion,
      rootDir,
      dataDir: path.join(rootDir, 'data'),
      client,
      server,
      code: {
        version: codeVersion,
        rootDir: server.rootDir,
        entrypoint: server.entrypoint,
      },
      healthPath: server.healthPath ?? packageJson?.app?.healthPath ?? '/healthz',
      resourcePolicy: packageJson?.app?.resourcePolicy,
      config: packageJson?.app?.config,
    };
  }
}

export function defaultAppsDir(): string {
  return path.resolve(process.cwd(), 'app-dist');
}

async function readDirectories(rootDir: string): Promise<Array<{ name: string }>> {
  let entries: Array<{
    name: string;
    isDirectory(): boolean;
    isSymbolicLink(): boolean;
  }>;
  try {
    entries = await readdir(rootDir, { withFileTypes: true });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') {
      return [];
    }

    throw error;
  }

  const directories: Array<{ name: string }> = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      directories.push({ name: entry.name });
      continue;
    }

    if (!entry.isSymbolicLink()) {
      continue;
    }

    const entryPath = path.join(rootDir, entry.name);
    let stats: Awaited<ReturnType<typeof stat>> | null;
    try {
      stats = await stat(entryPath);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT' || code === 'ENOTDIR') {
        stats = null;
      } else {
        throw error;
      }
    }

    if (stats?.isDirectory()) {
      directories.push({ name: entry.name });
    }
  }

  return directories;
}

async function readAppPackage(rootDir: string): Promise<AppPackageJson | null> {
  const packagePath = path.join(rootDir, 'package.json');

  try {
    return JSON.parse(await readFile(packagePath, 'utf8')) as AppPackageJson;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      return null;
    }

    throw error;
  }
}

async function resolveServer(rootDir: string): Promise<AppServerReference | undefined> {
  const entrypoint = await firstExistingPath(rootDir, SERVER_ENTRYPOINT_CANDIDATES);
  if (!entrypoint) {
    return undefined;
  }

  return {
    rootDir,
    entrypoint,
  };
}

async function resolveClient(rootDir: string): Promise<AppClientReference | undefined> {
  const clientDir = await firstExistingDirectory(rootDir, CLIENT_DIR_CANDIDATES);
  if (!clientDir) {
    return undefined;
  }

  const absoluteClientDir = path.resolve(rootDir, clientDir);
  assertInside(rootDir, absoluteClientDir);
  const index = (await firstExistingPath(rootDir, [`${clientDir}/index.html`])) ?? undefined;
  const assetsDir = (await firstExistingDirectory(rootDir, [`${clientDir}/assets`])) ?? undefined;

  return {
    rootDir: absoluteClientDir,
    index: index ? path.basename(index) : undefined,
    assetsDir: assetsDir ? path.resolve(rootDir, assetsDir) : undefined,
  };
}

async function firstExistingPath(rootDir: string, candidates: Array<string | undefined>): Promise<string | null> {
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    const absolutePath = path.resolve(rootDir, candidate);
    assertInside(rootDir, absolutePath);

    try {
      const stats = await stat(absolutePath);
      if (stats.isFile()) {
        return candidate;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  return null;
}

async function firstExistingDirectory(rootDir: string, candidates: Array<string | undefined>): Promise<string | null> {
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    const absolutePath = path.resolve(rootDir, candidate);
    assertInside(rootDir, absolutePath);

    try {
      const stats = await stat(absolutePath);
      if (stats.isDirectory()) {
        return candidate;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  return null;
}

function definitionToOptions(definition: AppDefinition): CreateAppDefinitionOptions {
  return {
    appName: definition.appName,
    basePath: definition.basePath,
    enabled: definition.enabled,
    configVersion: definition.configVersion,
    backend: definition.backend,
    isolation: definition.isolation,
    tier: definition.tier,
    desiredVersion: definition.desiredVersion,
    rootDir: definition.rootDir,
    dataDir: definition.dataDir,
    client: definition.client,
    server: definition.server,
    api: definition.api,
    code: definition.code,
    release: definition.release,
    healthPath: definition.healthPath,
    resourcePolicy: definition.resourcePolicy,
    config: definition.config,
  };
}

function definitionsEquivalent(a: AppDefinition, b: AppDefinition): boolean {
  return JSON.stringify(definitionToOptions(a)) === JSON.stringify(definitionToOptions(b));
}

function assertInside(rootDir: string, targetPath: string): void {
  const relative = path.relative(rootDir, targetPath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`App artifact path must stay inside ${rootDir}`);
  }
}

function isValidAppSegment(segment: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(segment);
}

const importModule: DynamicImport = (specifier) => import(specifier) as Promise<AppModule>;
