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
import { mkdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { finished, pipeline } from 'node:stream/promises';

import type { NocoBaseDriveDisk } from '@nocobase/drive';
import { x as extractTar } from 'tar';

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
}

export class DriveArtifactResolver implements ArtifactResolver {
  readonly appDeploymentsDir: string;
  readonly localArtifactDir?: string;

  constructor(
    readonly disk: NocoBaseDriveDisk,
    readonly catalog: DeploymentCatalog,
    options: DriveArtifactResolverOptions,
  ) {
    this.appDeploymentsDir = path.resolve(options.appDeploymentsDir);
    this.localArtifactDir = options.localArtifactDir
      ? path.resolve(options.localArtifactDir)
      : undefined;
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

    try {
      const localPath = this.localArtifactPath(reference.key);
      const actualChecksum = localPath
        ? await hashLocalArtifact(localPath)
        : await downloadArtifact(this.disk, reference.key, archivePath);
      if (actualChecksum !== reference.checksum) {
        throw new Error(
          `Artifact checksum mismatch for app "${reference.appId}": expected "${reference.checksum}", received "${actualChecksum}"`,
        );
      }

      await mkdir(stagingDir, { recursive: true, mode: 0o700 });
      await extractTar({
        cwd: stagingDir,
        file: localPath ?? archivePath,
        gzip: true,
        preservePaths: false,
        strict: true,
        filter: assertSafeArchiveEntry,
      });
      const stagedDefinition = await this.catalog.discoverAt(
        reference.appId,
        stagingDir,
      );
      assertArtifactIdentity(stagedDefinition, reference);

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

      let settled = false;
      return {
        reference,
        definition,
        commit: async (): Promise<void> => {
          if (settled) return;
          settled = true;
          if (hasBackup) {
            await rm(backupDir, { recursive: true, force: true });
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
