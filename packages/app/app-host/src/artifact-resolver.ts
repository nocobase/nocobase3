/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { finished, pipeline } from 'node:stream/promises';

import type { NocoBaseDriveDisk } from '@nocobase/drive';
import { x as extractTar } from 'tar';
import type { Logger } from '@nocobase/logging';

import type { DeploymentCatalog } from './deployment/catalog.ts';
import type { AppDefinition } from './app-types.ts';

export interface ArtifactReference {
  key: string;
  appId: string;
  version: string;
  checksum: string;
}

export interface ResolvedArtifact {
  reference: ArtifactReference;
  definition: AppDefinition;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

export interface ArtifactResolver {
  resolve(reference: ArtifactReference): Promise<ResolvedArtifact>;
}

export interface DriveArtifactResolverOptions {
  appDeploymentsDir: string;
  localArtifactDir?: string;
  logger?: Logger;
}

interface InstalledArtifactMetadata {
  readonly formatVersion: 1;
  readonly reference: ArtifactReference;
}

const INSTALLED_ARTIFACT_FILE = '.nocobase-artifact.json';

export class DriveArtifactResolver implements ArtifactResolver {
  readonly appDeploymentsDir: string;
  readonly localArtifactDir?: string;
  readonly logger?: Logger;

  constructor(
    readonly disk: NocoBaseDriveDisk,
    readonly catalog: DeploymentCatalog,
    options: DriveArtifactResolverOptions,
  ) {
    this.appDeploymentsDir = path.resolve(options.appDeploymentsDir);
    this.localArtifactDir = options.localArtifactDir
      ? path.resolve(options.localArtifactDir)
      : undefined;
    this.logger = options.logger;
  }

  async resolve(reference: ArtifactReference): Promise<ResolvedArtifact> {
    validateArtifactReference(reference);
    await mkdir(this.appDeploymentsDir, { recursive: true, mode: 0o700 });

    const nonce = `${process.pid}.${randomUUID()}`;
    const archivePath = path.join(
      this.appDeploymentsDir,
      `.${reference.appId}.${nonce}.tar.gz`,
    );
    const stagingDir = path.join(
      this.appDeploymentsDir,
      `.${reference.appId}.${nonce}.staging`,
    );
    const targetDir = path.join(this.appDeploymentsDir, reference.appId);
    const backupDir = path.join(
      this.appDeploymentsDir,
      `.${reference.appId}.${nonce}.previous`,
    );
    let hasBackup = false;
    let installed = false;
    const startedAt = Date.now();

    try {
      const installedArtifact = await this.resolveInstalledArtifact(
        reference,
        targetDir,
      );
      if (installedArtifact) {
        this.logger?.info(
          {
            appId: reference.appId,
            artifactKey: reference.key,
            artifactVersion: reference.version,
            artifactChecksum: reference.checksum,
            cacheHit: true,
            durationMs: Date.now() - startedAt,
          },
          'Reused installed app artifact',
        );
        return installedArtifact;
      }

      const checksumStartedAt = Date.now();
      const localPath = this.localArtifactPath(reference.key);
      const actualChecksum = localPath
        ? await hashLocalArtifact(localPath)
        : await downloadArtifact(this.disk, reference.key, archivePath);
      const checksumDurationMs = Date.now() - checksumStartedAt;
      if (actualChecksum !== reference.checksum) {
        throw new Error(
          `Artifact checksum mismatch for app "${reference.appId}": expected "${reference.checksum}", received "${actualChecksum}"`,
        );
      }

      await mkdir(stagingDir, { recursive: true, mode: 0o700 });
      const extractStartedAt = Date.now();
      await extractTar({
        cwd: stagingDir,
        file: localPath ?? archivePath,
        gzip: true,
        preservePaths: false,
        strict: true,
        filter: assertSafeArchiveEntry,
      });
      const extractDurationMs = Date.now() - extractStartedAt;
      const discoveryStartedAt = Date.now();
      const stagedDefinition = await this.catalog.discoverAt(
        reference.appId,
        stagingDir,
      );
      assertArtifactIdentity(stagedDefinition, reference);
      await writeInstalledArtifactMetadata(stagingDir, reference);
      const discoveryDurationMs = Date.now() - discoveryStartedAt;

      const swapStartedAt = Date.now();
      try {
        await rename(targetDir, backupDir);
        hasBackup = true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
      await rename(stagingDir, targetDir);
      installed = true;
      const definition = await this.catalog.discoverAt(
        reference.appId,
        targetDir,
      );
      const swapDurationMs = Date.now() - swapStartedAt;

      this.logger?.info(
        {
          appId: reference.appId,
          artifactKey: reference.key,
          artifactVersion: reference.version,
          artifactChecksum: reference.checksum,
          cacheHit: false,
          checksumDurationMs,
          extractDurationMs,
          discoveryDurationMs,
          swapDurationMs,
          durationMs: Date.now() - startedAt,
        },
        'Installed app artifact',
      );

      let settled = false;
      return {
        reference,
        definition,
        commit: async (): Promise<void> => {
          if (settled) return;
          settled = true;
          if (hasBackup) {
            this.removeInBackground(backupDir, reference);
          }
        },
        rollback: async (): Promise<void> => {
          if (settled) return;
          settled = true;
          if (installed) {
            await rm(targetDir, { recursive: true, force: true });
          }
          if (hasBackup) {
            await rename(backupDir, targetDir);
          }
        },
      };
    } catch (error) {
      if (installed) {
        await rm(targetDir, { recursive: true, force: true });
      }
      if (hasBackup) {
        await rename(backupDir, targetDir);
      }
      throw error;
    } finally {
      await rm(archivePath, { force: true });
      await rm(stagingDir, { recursive: true, force: true });
    }
  }

  private localArtifactPath(key: string): string | undefined {
    if (!this.localArtifactDir) return undefined;
    const filePath = path.resolve(this.localArtifactDir, key);
    const relative = path.relative(this.localArtifactDir, filePath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error(
        'Artifact key resolves outside the local artifact directory',
      );
    }
    return filePath;
  }

  private async resolveInstalledArtifact(
    reference: ArtifactReference,
    targetDir: string,
  ): Promise<ResolvedArtifact | null> {
    const metadata = await readInstalledArtifactMetadata(targetDir);
    if (!metadata || !artifactReferencesEqual(metadata.reference, reference)) {
      return null;
    }
    const definition = await this.catalog.discoverAt(
      reference.appId,
      targetDir,
    );
    assertArtifactIdentity(definition, reference);
    return {
      reference,
      definition,
      commit: () => Promise.resolve(),
      rollback: () => Promise.resolve(),
    };
  }

  private removeInBackground(
    directory: string,
    reference: ArtifactReference,
  ): void {
    const startedAt = Date.now();
    void rm(directory, { recursive: true, force: true })
      .then(() => {
        this.logger?.info(
          {
            appId: reference.appId,
            artifactKey: reference.key,
            directory,
            durationMs: Date.now() - startedAt,
          },
          'Removed previous app artifact in background',
        );
      })
      .catch((error: unknown) => {
        this.logger?.warn(
          { err: error, appId: reference.appId, directory },
          'Failed to remove previous app artifact in background',
        );
      });
  }
}

async function readInstalledArtifactMetadata(
  targetDir: string,
): Promise<InstalledArtifactMetadata | null> {
  try {
    const value = JSON.parse(
      await readFile(path.join(targetDir, INSTALLED_ARTIFACT_FILE), 'utf8'),
    ) as Partial<InstalledArtifactMetadata>;
    return value.formatVersion === 1 && value.reference
      ? (value as InstalledArtifactMetadata)
      : null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    return null;
  }
}

async function writeInstalledArtifactMetadata(
  targetDir: string,
  reference: ArtifactReference,
): Promise<void> {
  const metadata: InstalledArtifactMetadata = {
    formatVersion: 1,
    reference,
  };
  await writeFile(
    path.join(targetDir, INSTALLED_ARTIFACT_FILE),
    `${JSON.stringify(metadata)}\n`,
    { mode: 0o600, flag: 'wx' },
  );
}

function artifactReferencesEqual(
  left: ArtifactReference,
  right: ArtifactReference,
): boolean {
  return (
    typeof left.key === 'string' &&
    typeof left.appId === 'string' &&
    typeof left.version === 'string' &&
    typeof left.checksum === 'string' &&
    left.key === right.key &&
    left.appId === right.appId &&
    left.version === right.version &&
    left.checksum.toLowerCase() === right.checksum.toLowerCase()
  );
}

async function downloadArtifact(
  disk: NocoBaseDriveDisk,
  key: string,
  destination: string,
): Promise<string> {
  const hash = createHash('sha256');
  const source = await disk.getStream(key);
  source.on('data', (chunk: Buffer | string) => hash.update(chunk));
  await pipeline(
    source,
    createWriteStream(destination, { flags: 'wx', mode: 0o600 }),
  );
  return hash.digest('hex');
}

async function hashLocalArtifact(source: string): Promise<string> {
  const hash = createHash('sha256');
  const sourceStream = createReadStream(source);
  sourceStream.on('data', (chunk: Buffer | string) => hash.update(chunk));
  await finished(sourceStream);
  return hash.digest('hex');
}

function validateArtifactReference(reference: ArtifactReference): void {
  if (!reference || typeof reference !== 'object') {
    throw new Error('Artifact reference must be an object');
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(reference.appId)) {
    throw new Error(`Invalid artifact app ID "${reference.appId}"`);
  }
  if (
    !reference.key ||
    path.isAbsolute(reference.key) ||
    reference.key.split(/[\\/]/).includes('..')
  ) {
    throw new Error('Artifact key must be a non-empty relative key');
  }
  if (!reference.version) {
    throw new Error('Artifact version must be a non-empty string');
  }
  if (!/^[a-fA-F0-9]{64}$/.test(reference.checksum)) {
    throw new Error('Artifact checksum must be a SHA-256 hex digest');
  }
}

function assertSafeArchiveEntry(entryPath: string): boolean {
  const normalized = path.posix.normalize(entryPath.replaceAll('\\', '/'));
  if (
    path.posix.isAbsolute(normalized) ||
    normalized === '..' ||
    normalized.startsWith('../')
  ) {
    throw new Error(`Artifact archive contains an unsafe path "${entryPath}"`);
  }
  if (normalized === INSTALLED_ARTIFACT_FILE) {
    throw new Error(
      `Artifact archive contains reserved path "${INSTALLED_ARTIFACT_FILE}"`,
    );
  }
  return true;
}

function assertArtifactIdentity(
  definition: AppDefinition,
  reference: ArtifactReference,
): void {
  const version = definition.release?.version ?? definition.desiredVersion;
  if (definition.id !== reference.appId) {
    throw new Error(
      `Artifact app ID mismatch: expected "${reference.appId}", received "${definition.id}"`,
    );
  }
  if (version !== reference.version) {
    throw new Error(
      `Artifact version mismatch for app "${reference.appId}": expected "${reference.version}", received "${version}"`,
    );
  }
}
