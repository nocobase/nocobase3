/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { createHash } from 'node:crypto';
import type { Dirent } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import type {
  AppBackendKind,
  AppClientReference,
  AppDefinition,
  AppIsolation,
  AppResourcePolicy,
  AppServerReference,
  AppTier,
} from '../app-types.ts';

export interface DeploymentCatalogOptions {
  deploymentsDir?: string;
  volumesDir?: string;
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
    configPath?: string;
    config?: unknown;
  };
}

const SERVER_ENTRYPOINT_CANDIDATES = ['dist/server/embedded.js'];
const CLIENT_DIR_CANDIDATES = ['dist/client'];

export class DeploymentCatalog {
  readonly deploymentsDir: string;
  readonly volumesDir: string;

  constructor(options: DeploymentCatalogOptions = {}) {
    this.deploymentsDir = path.resolve(
      options.deploymentsDir ?? defaultDeploymentsDir(),
    );
    this.volumesDir = path.resolve(options.volumesDir ?? defaultVolumesDir());
  }

  async discover(): Promise<AppDefinition[]> {
    const entries = await this.readDirectories(this.deploymentsDir);
    const definitions: AppDefinition[] = [];

    for (const entry of entries) {
      if (!this.isValidAppId(entry.name)) {
        continue;
      }

      const definition = await this.readDefinition(
        entry.name,
        path.join(this.deploymentsDir, entry.name),
      );
      if (definition) {
        definitions.push(definition);
      }
    }

    return definitions.sort((a, b) => a.id.localeCompare(b.id));
  }

  async discoverAt(appId: string, rootDir: string): Promise<AppDefinition> {
    if (!this.isValidAppId(appId)) {
      throw new Error(`Invalid app ID "${appId}"`);
    }

    const definition = await this.readDefinition(appId, path.resolve(rootDir));
    if (!definition) {
      throw new Error(`Deployment for app "${appId}" has no server entrypoint`);
    }
    return definition;
  }

  private async readDefinition(
    appId: string,
    rootDir: string,
  ): Promise<AppDefinition | null> {
    const packageJson = await this.readAppPackage(rootDir);
    const client = await this.resolveClient(rootDir);
    const server = await this.resolveServer(rootDir);
    if (!server) {
      return null;
    }

    const absoluteEntrypoint = path.resolve(server.rootDir, server.entrypoint);
    this.assertInside(rootDir, absoluteEntrypoint);

    const version =
      packageJson?.app?.version ?? packageJson?.version ?? 'local';
    const fingerprint = await this.calculateFingerprint(rootDir);

    return {
      id: appId,
      appName: appId,
      basePath: `/${appId}`,
      enabled: packageJson?.app?.enabled ?? true,
      backend:
        packageJson?.app?.backend ??
        packageJson?.app?.isolation ??
        'in-process',
      configVersion: packageJson?.app?.configVersion ?? 'v1',
      isolation: packageJson?.app?.isolation ?? 'in-process',
      tier: packageJson?.app?.tier ?? 'warm',
      desiredVersion: version,
      rootDir,
      dataDir: path.join(this.volumesDir, appId, 'storage'),
      configPath:
        packageJson?.app?.configPath ??
        (await this.existingFile(
          path.join(this.volumesDir, appId, 'config.yml'),
        )),
      client,
      server,
      code: {
        version,
        rootDir: server.rootDir,
        entrypoint: server.entrypoint,
        fingerprint,
      },
      release: {
        version,
        rootDir: server.rootDir,
        entrypoint: server.entrypoint,
        fingerprint,
        releaseDir: rootDir,
      },
      healthPath:
        server.healthPath ?? packageJson?.app?.healthPath ?? '/healthz',
      resourcePolicy: packageJson?.app?.resourcePolicy,
    };
  }

  private async readDirectories(
    rootDir: string,
  ): Promise<Array<{ name: string }>> {
    let entries: Dirent<string>[];
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

      try {
        if ((await stat(path.join(rootDir, entry.name))).isDirectory()) {
          directories.push({ name: entry.name });
        }
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== 'ENOENT' && code !== 'ENOTDIR') {
          throw error;
        }
      }
    }
    return directories;
  }

  private async readAppPackage(
    rootDir: string,
  ): Promise<AppPackageJson | null> {
    try {
      return JSON.parse(
        await readFile(path.join(rootDir, 'package.json'), 'utf8'),
      ) as AppPackageJson;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  private async existingFile(filePath: string): Promise<string | undefined> {
    try {
      return (await stat(filePath)).isFile() ? filePath : undefined;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return undefined;
      }
      throw error;
    }
  }

  private async resolveServer(
    rootDir: string,
  ): Promise<AppServerReference | undefined> {
    const entrypoint = await this.firstExistingFile(
      rootDir,
      SERVER_ENTRYPOINT_CANDIDATES,
    );
    return entrypoint ? { rootDir, entrypoint } : undefined;
  }

  private async resolveClient(
    rootDir: string,
  ): Promise<AppClientReference | undefined> {
    const clientDir = await this.firstExistingDirectory(
      rootDir,
      CLIENT_DIR_CANDIDATES,
    );
    if (!clientDir) {
      return undefined;
    }

    const absoluteClientDir = path.resolve(rootDir, clientDir);
    this.assertInside(rootDir, absoluteClientDir);
    const index = await this.firstExistingFile(rootDir, [
      `${clientDir}/index.html`,
    ]);
    const assetsDir = await this.firstExistingDirectory(rootDir, [
      `${clientDir}/assets`,
    ]);

    return {
      rootDir: absoluteClientDir,
      index: index ? path.basename(index) : undefined,
      assetsDir: assetsDir ? path.resolve(rootDir, assetsDir) : undefined,
    };
  }

  private async firstExistingFile(
    rootDir: string,
    candidates: readonly string[],
  ): Promise<string | null> {
    return this.firstExisting(rootDir, candidates, 'file');
  }

  private async firstExistingDirectory(
    rootDir: string,
    candidates: readonly string[],
  ): Promise<string | null> {
    return this.firstExisting(rootDir, candidates, 'directory');
  }

  private async firstExisting(
    rootDir: string,
    candidates: readonly string[],
    kind: 'file' | 'directory',
  ): Promise<string | null> {
    for (const candidate of candidates) {
      const absolutePath = path.resolve(rootDir, candidate);
      this.assertInside(rootDir, absolutePath);
      try {
        const stats = await stat(absolutePath);
        if (kind === 'file' ? stats.isFile() : stats.isDirectory()) {
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

  private assertInside(rootDir: string, targetPath: string): void {
    const relative = path.relative(rootDir, targetPath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error(`App deployment path must stay inside ${rootDir}`);
    }
  }

  private isValidAppId(appId: string): boolean {
    return /^[a-zA-Z0-9_-]+$/.test(appId);
  }

  private async calculateFingerprint(rootDir: string): Promise<string> {
    const files: string[] = [];
    await this.collectFiles(rootDir, rootDir, files);
    files.sort((a, b) => a.localeCompare(b));

    const hash = createHash('sha256');
    for (const file of files) {
      hash.update(path.relative(rootDir, file).split(path.sep).join('/'));
      hash.update('\0');
      hash.update(await readFile(file));
      hash.update('\0');
    }
    return hash.digest('hex');
  }

  private async collectFiles(
    rootDir: string,
    directory: string,
    files: string[],
  ): Promise<void> {
    let entries: Dirent<string>[];
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return;
      }
      throw error;
    }

    for (const entry of entries) {
      const entryPath = path.join(directory, entry.name);
      this.assertInside(rootDir, entryPath);
      if (entry.isDirectory()) {
        await this.collectFiles(rootDir, entryPath, files);
      } else if (entry.isFile()) {
        files.push(entryPath);
      } else if (entry.isSymbolicLink()) {
        throw new Error(
          `App deployment must not contain symbolic link ${entryPath}`,
        );
      }
    }
  }
}

export function defaultDeploymentsDir(): string {
  return path.resolve(process.cwd(), 'storage', 'app-deployments');
}

export function defaultVolumesDir(): string {
  return path.resolve(process.cwd(), 'storage', 'app-volumes');
}
