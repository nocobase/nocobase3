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
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  stat,
} from 'node:fs/promises';
import type { IncomingMessage } from 'node:http';
import path from 'node:path';
import { Readable, Transform, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';
import { extract, type Header } from 'tar-stream';
import { AppReleaseIntegrityError, AppRegistryError } from './errors.ts';
import {
  isSafeSegment,
  parseReleaseManifest,
  readAppRelease,
  type AppCatalogRelease,
} from './app-release.ts';

type AppReleaseMediaType = 'application/vnd.nocobase.release+tar+gzip';

const APP_RELEASE_MEDIA_TYPE: AppReleaseMediaType =
  'application/vnd.nocobase.release+tar+gzip';

interface AppReleaseUploadLimits {
  maxCompressedBytes: number;
  maxExpandedBytes: number;
  maxEntries: number;
}

interface AppReleaseUploaderOptions {
  appsDir: string;
  limits?: Partial<AppReleaseUploadLimits>;
}

interface AppReleaseUploadResult {
  status: 'created' | 'unchanged';
  release: AppCatalogRelease;
}

const DEFAULT_MAX_COMPRESSED_BYTES = 512 * 1024 * 1024;
const DEFAULT_MAX_EXPANDED_BYTES = 1024 * 1024 * 1024;
const DEFAULT_MAX_ENTRIES = 100_000;
const MAX_METADATA_BYTES = 1024 * 1024;

class AppReleaseArchiveError extends AppRegistryError {
  constructor(message: string, cause?: unknown) {
    super(message, {
      status: 400,
      code: 'APP_RELEASE_ARCHIVE_INVALID',
      cause,
    });
  }
}

class AppReleaseUploadLimitError extends AppRegistryError {
  constructor(limit: string, maximum: number) {
    super(`Release upload exceeds ${limit} limit of ${maximum}`, {
      status: 413,
      code: 'APP_RELEASE_UPLOAD_LIMIT_EXCEEDED',
    });
  }
}

class AppReleaseImmutableError extends AppRegistryError {
  constructor(id: string, releaseId: string) {
    super(
      `Release "${releaseId}" for app "${id}" already exists with different content`,
      {
        status: 409,
        code: 'APP_RELEASE_IMMUTABLE',
      },
    );
  }
}

class AppReleaseMediaTypeError extends AppRegistryError {
  constructor(expected: string) {
    super(`Release upload must use Content-Type ${expected}`, {
      status: 415,
      code: 'APP_RELEASE_MEDIA_TYPE_UNSUPPORTED',
    });
  }
}

export class AppReleaseUploader {
  readonly appsDir: string;
  readonly uploadsDir: string;
  readonly limits: AppReleaseUploadLimits;

  constructor(options: AppReleaseUploaderOptions) {
    this.appsDir = path.resolve(options.appsDir);
    this.uploadsDir = path.join(this.appsDir, '.uploads');
    this.limits = {
      maxCompressedBytes: positiveLimit(
        options.limits?.maxCompressedBytes,
        DEFAULT_MAX_COMPRESSED_BYTES,
        'maxCompressedBytes',
      ),
      maxExpandedBytes: positiveLimit(
        options.limits?.maxExpandedBytes,
        DEFAULT_MAX_EXPANDED_BYTES,
        'maxExpandedBytes',
      ),
      maxEntries: positiveLimit(
        options.limits?.maxEntries,
        DEFAULT_MAX_ENTRIES,
        'maxEntries',
      ),
    };
  }

  async upload(
    req: IncomingMessage,
    appId: string,
    releaseId: string,
  ): Promise<AppReleaseUploadResult> {
    assertRuntimeAppId(appId);
    assertSafeSegment(releaseId, 'release id');
    assertMediaType(req);
    assertContentLength(req, this.limits.maxCompressedBytes);

    await mkdir(this.appsDir, { recursive: true, mode: 0o755 });
    await ensureSafeDirectory(this.uploadsDir, 0o700);
    const stagingDir = await mkdtemp(
      path.join(
        this.uploadsDir,
        `${appId}.${releaseId}.${process.pid}.${randomUUID()}.`,
      ),
    );

    try {
      await this.extractRequest(req, stagingDir);
      await assertRequiredReleaseFiles(stagingDir);
      const stagedRelease = await readAppReleaseFromRoot(
        stagingDir,
        appId,
        releaseId,
      );
      const stagedTreeHash = await hashReleaseTree(stagingDir);
      const appDir = path.join(this.appsDir, appId);
      const releasesDir = path.join(appDir, 'releases');
      const releaseDir = path.join(releasesDir, releaseId);
      await ensureSafeDirectory(appDir, 0o755);
      await ensureSafeDirectory(releasesDir, 0o755);

      const existing = await readExistingRelease(
        this.appsDir,
        appId,
        releaseId,
      );
      if (existing) {
        const existingTreeHash = await hashReleaseTree(existing.rootDir);
        if (existingTreeHash !== stagedTreeHash) {
          throw new AppReleaseImmutableError(appId, releaseId);
        }
        return { status: 'unchanged', release: existing };
      }

      try {
        await rename(stagingDir, releaseDir);
      } catch (error) {
        if (!isExistingTargetError(error)) {
          throw error;
        }
        const racedRelease = await readAppRelease(
          this.appsDir,
          appId,
          releaseId,
        );
        if ((await hashReleaseTree(racedRelease.rootDir)) !== stagedTreeHash) {
          throw new AppReleaseImmutableError(appId, releaseId);
        }
        return { status: 'unchanged', release: racedRelease };
      }

      return {
        status: 'created',
        release: {
          ...stagedRelease,
          rootDir: releaseDir,
          manifestPath: path.join(releaseDir, 'app-release.json'),
        },
      };
    } finally {
      await rm(stagingDir, { recursive: true, force: true }).catch(
        () => undefined,
      );
    }
  }

  private async extractRequest(
    req: IncomingMessage,
    stagingDir: string,
  ): Promise<void> {
    const seen = new Set<string>();
    let entryCount = 0;
    let expandedBytes = 0;
    const tar = extract();

    tar.on('entry', (header, stream, next) => {
      void this.extractEntry(
        header,
        stream as unknown as Readable,
        stagingDir,
        seen,
        (): void => {
          entryCount += 1;
          if (entryCount > this.limits.maxEntries) {
            throw new AppReleaseUploadLimitError(
              'entry count',
              this.limits.maxEntries,
            );
          }
          expandedBytes += header.size;
          if (expandedBytes > this.limits.maxExpandedBytes) {
            throw new AppReleaseUploadLimitError(
              'expanded bytes',
              this.limits.maxExpandedBytes,
            );
          }
        },
      ).then(
        () => next(),
        (error: unknown) => next(toError(error)),
      );
    });

    try {
      await pipeline(
        req,
        byteLimitTransform(this.limits.maxCompressedBytes, 'compressed bytes'),
        createGunzip(),
        tar as unknown as Writable,
      );
    } catch (error) {
      if (error instanceof AppRegistryError) {
        throw error;
      }
      throw new AppReleaseArchiveError(
        `Invalid compressed Release archive: ${error instanceof Error ? error.message : String(error)}`,
        error,
      );
    }
  }

  private async extractEntry(
    header: Header,
    stream: Readable,
    stagingDir: string,
    seen: Set<string>,
    account: () => void,
  ): Promise<void> {
    if (!Number.isSafeInteger(header.size) || header.size < 0) {
      throw new AppReleaseArchiveError(
        `Release archive entry has invalid size: ${header.name}`,
      );
    }
    account();
    const entryName = validateEntryName(header.name);
    if (seen.has(entryName)) {
      throw new AppReleaseArchiveError(
        `Release archive contains duplicate entry ${entryName}`,
      );
    }
    seen.add(entryName);
    if (!isAllowedEntry(entryName)) {
      throw new AppReleaseArchiveError(
        `Release archive entry is not allowed: ${entryName}`,
      );
    }
    if (header.type !== 'file' && header.type !== 'directory') {
      throw new AppReleaseArchiveError(
        `Release archive entry type ${header.type} is not allowed`,
      );
    }

    const target = path.resolve(stagingDir, entryName);
    assertInside(stagingDir, target);
    if (header.type === 'directory') {
      await mkdir(target, { recursive: true, mode: 0o755 });
      const end = waitForEnd(stream);
      stream.resume();
      await end;
      return;
    }

    await mkdir(path.dirname(target), { recursive: true, mode: 0o755 });
    await pipeline(
      stream,
      createWriteStream(target, {
        flags: 'wx',
        mode: 0o644,
      }),
    );
  }
}

function assertMediaType(req: IncomingMessage): void {
  const mediaType = req.headers['content-type']?.split(';', 1)[0]?.trim();
  if (mediaType?.toLowerCase() !== APP_RELEASE_MEDIA_TYPE) {
    throw new AppReleaseMediaTypeError(APP_RELEASE_MEDIA_TYPE);
  }
}

function assertContentLength(req: IncomingMessage, maximum: number): void {
  const value = req.headers['content-length'];
  if (!value) {
    return;
  }
  const length = Number(value);
  if (!Number.isSafeInteger(length) || length < 0) {
    throw new AppReleaseArchiveError('Invalid Content-Length header');
  }
  if (length > maximum) {
    throw new AppReleaseUploadLimitError('compressed bytes', maximum);
  }
}

function byteLimitTransform(maximum: number, label: string): Transform {
  let total = 0;
  return new Transform({
    transform(chunk: Buffer, _encoding, callback): void {
      total += chunk.byteLength;
      if (total > maximum) {
        callback(new AppReleaseUploadLimitError(label, maximum));
        return;
      }
      callback(null, chunk);
    },
  });
}

function validateEntryName(value: string): string {
  if (
    !value ||
    value.length > 4096 ||
    hasControlCharacter(value) ||
    value.includes('\0') ||
    value.includes('\\') ||
    value.startsWith('/') ||
    /^[a-zA-Z]:/.test(value)
  ) {
    throw new AppReleaseArchiveError(
      `Release archive contains unsafe entry name ${JSON.stringify(value)}`,
    );
  }
  const withoutDotPrefix = value.replace(/^(?:\.\/)+/, '');
  const withoutTrailingSlash = withoutDotPrefix.replace(/\/+$/, '');
  const segments = withoutTrailingSlash.split('/');
  if (
    !withoutTrailingSlash ||
    segments.some((segment) => !segment || segment === '.' || segment === '..')
  ) {
    throw new AppReleaseArchiveError(
      `Release archive contains unsafe entry name ${JSON.stringify(value)}`,
    );
  }
  return segments.join('/');
}

function isAllowedEntry(entryName: string): boolean {
  return (
    entryName === 'app-release.json' ||
    entryName === 'package.json' ||
    entryName === 'dist' ||
    entryName.startsWith('dist/')
  );
}

function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if ((code >= 0 && code <= 31) || code === 127) {
      return true;
    }
  }
  return false;
}

async function assertRequiredReleaseFiles(rootDir: string): Promise<void> {
  const metadataFiles = new Set(['app-release.json', 'package.json']);
  for (const relativePath of [
    'app-release.json',
    'package.json',
    'dist/server/embedded.js',
  ]) {
    const target = path.join(rootDir, relativePath);
    let targetStat: Awaited<ReturnType<typeof stat>>;
    try {
      targetStat = await stat(target);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new AppReleaseArchiveError(
          `Release archive is missing ${relativePath}`,
        );
      }
      throw error;
    }
    if (!targetStat.isFile()) {
      throw new AppReleaseArchiveError(
        `Release archive ${relativePath} must be a file`,
      );
    }
    if (
      metadataFiles.has(relativePath) &&
      targetStat.size > MAX_METADATA_BYTES
    ) {
      throw new AppReleaseArchiveError(
        `Release archive ${relativePath} exceeds ${MAX_METADATA_BYTES} bytes`,
      );
    }
  }

  try {
    const packageValue = JSON.parse(
      await readFile(path.join(rootDir, 'package.json'), 'utf8'),
    ) as unknown;
    if (
      !packageValue ||
      typeof packageValue !== 'object' ||
      Array.isArray(packageValue)
    ) {
      throw new Error('must be an object');
    }
  } catch (error) {
    throw new AppReleaseArchiveError(
      `Release package.json is invalid: ${error instanceof Error ? error.message : String(error)}`,
      error,
    );
  }
}

async function readAppReleaseFromRoot(
  rootDir: string,
  appId: string,
  releaseId: string,
): Promise<AppCatalogRelease> {
  const manifestPath = path.join(rootDir, 'app-release.json');
  let manifest: AppCatalogRelease['manifest'];
  try {
    manifest = parseReleaseManifest(
      await readFile(manifestPath, 'utf8'),
      manifestPath,
    );
  } catch (error) {
    throw new AppReleaseArchiveError('Release manifest is invalid', error);
  }
  if (manifest.appId !== appId || manifest.releaseId !== releaseId) {
    throw new AppReleaseArchiveError(
      'Release manifest appId and releaseId must match the upload URL',
    );
  }

  const packageManifest = await readPackageManifest(rootDir);
  if (packageManifest.name !== appId) {
    throw new AppReleaseArchiveError(
      `Release package.json name must match app id ${appId}`,
    );
  }
  if (packageManifest.version !== manifest.version) {
    throw new AppReleaseArchiveError(
      `Release package.json version must match manifest version ${manifest.version}`,
    );
  }

  const actualArtifactSha256 = await hashArtifactDirectory(
    path.join(rootDir, 'dist'),
  );
  if (actualArtifactSha256 !== manifest.artifactSha256) {
    throw new AppReleaseIntegrityError(
      appId,
      releaseId,
      `expected ${manifest.artifactSha256}, received ${actualArtifactSha256}`,
    );
  }
  return {
    appId,
    id: releaseId,
    version: manifest.version,
    createdAt: manifest.createdAt ?? null,
    rootDir,
    manifestPath,
    manifest,
  };
}

async function readExistingRelease(
  appsDir: string,
  appId: string,
  releaseId: string,
): Promise<AppCatalogRelease | null> {
  const releaseDir = path.join(appsDir, appId, 'releases', releaseId);
  try {
    const releaseStat = await lstat(releaseDir);
    if (releaseStat.isSymbolicLink() || !releaseStat.isDirectory()) {
      throw new AppReleaseArchiveError(
        `Existing Release path ${appId}/${releaseId} is not a safe directory`,
      );
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
  return readAppRelease(appsDir, appId, releaseId);
}

async function ensureSafeDirectory(
  directory: string,
  mode: number,
): Promise<void> {
  try {
    await mkdir(directory, { mode });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
      throw error;
    }
  }
  const directoryStat = await lstat(directory);
  if (directoryStat.isSymbolicLink() || !directoryStat.isDirectory()) {
    throw new AppReleaseArchiveError(
      `Release destination is not a safe directory: ${directory}`,
    );
  }
}

async function hashReleaseTree(rootDir: string): Promise<string> {
  const hash = createHash('sha256');
  const entries: Array<{ relative: string; type: 'directory' | 'file' }> = [];

  const visit = async (directory: string): Promise<void> => {
    const directoryEntries = await readdir(directory, { withFileTypes: true });
    for (const entry of directoryEntries) {
      const entryPath = path.join(directory, entry.name);
      const relative = path
        .relative(rootDir, entryPath)
        .split(path.sep)
        .join('/');
      if (entry.isSymbolicLink()) {
        throw new AppReleaseArchiveError(
          `Release tree must not contain symbolic links: ${relative}`,
        );
      }
      if (entry.isDirectory()) {
        entries.push({ relative, type: 'directory' });
        await visit(entryPath);
      } else if (entry.isFile()) {
        entries.push({ relative, type: 'file' });
      } else {
        throw new AppReleaseArchiveError(
          `Release tree contains unsupported entry: ${relative}`,
        );
      }
    }
  };

  for (const relative of ['app-release.json', 'package.json']) {
    const entryPath = path.join(rootDir, relative);
    const entryStat = await lstat(entryPath);
    if (entryStat.isSymbolicLink() || !entryStat.isFile()) {
      throw new AppReleaseArchiveError(
        `Release contract entry must be a regular file: ${relative}`,
      );
    }
    entries.push({ relative, type: 'file' });
  }

  const distDir = path.join(rootDir, 'dist');
  const distStat = await lstat(distDir);
  if (distStat.isSymbolicLink() || !distStat.isDirectory()) {
    throw new AppReleaseArchiveError(
      'Release contract entry must be a directory: dist',
    );
  }
  entries.push({ relative: 'dist', type: 'directory' });
  await visit(distDir);
  entries.sort((left, right) => left.relative.localeCompare(right.relative));
  for (const entry of entries) {
    hash.update(entry.type === 'file' ? 'F\0' : 'D\0');
    hash.update(entry.relative);
    hash.update('\0');
    if (entry.type === 'file') {
      await updateHashWithFile(hash, path.join(rootDir, entry.relative));
      hash.update('\0');
    }
  }
  return hash.digest('hex');
}

async function hashArtifactDirectory(rootDir: string): Promise<string> {
  const hash = createHash('sha256');
  const files: string[] = [];
  const visit = async (directory: string): Promise<void> => {
    const entries = (await readdir(directory, { withFileTypes: true })).sort(
      (left, right) => left.name.localeCompare(right.name),
    );
    for (const entry of entries) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        throw new AppReleaseArchiveError(
          `Release artifact must not contain symbolic links: ${entryPath}`,
        );
      }
      if (entry.isDirectory()) {
        await visit(entryPath);
      } else if (entry.isFile()) {
        files.push(entryPath);
      } else {
        throw new AppReleaseArchiveError(
          `Release artifact contains unsupported entry: ${entryPath}`,
        );
      }
    }
  };
  await visit(rootDir);
  for (const file of files) {
    const relative = path.relative(rootDir, file).split(path.sep).join('/');
    hash.update(relative);
    hash.update('\0');
    await updateHashWithFile(hash, file);
    hash.update('\0');
  }
  return hash.digest('hex');
}

async function readPackageManifest(
  rootDir: string,
): Promise<{ name: string | undefined; version: string | undefined }> {
  const source = path.join(rootDir, 'package.json');
  const value = JSON.parse(await readFile(source, 'utf8')) as Record<
    string,
    unknown
  >;
  return {
    name: typeof value.name === 'string' ? value.name : undefined,
    version: typeof value.version === 'string' ? value.version : undefined,
  };
}

async function updateHashWithFile(
  hash: ReturnType<typeof createHash>,
  file: string,
): Promise<void> {
  for await (const chunk of createReadStream(file) as AsyncIterable<unknown>) {
    if (!(chunk instanceof Uint8Array)) {
      throw new Error(`Could not read Release file ${file}`);
    }
    hash.update(chunk);
  }
}

function positiveLimit(
  value: number | undefined,
  fallback: number,
  label: string,
): number {
  const selected = value ?? fallback;
  if (!Number.isSafeInteger(selected) || selected <= 0) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return selected;
}

function assertSafeSegment(value: string, label: string): void {
  if (!isSafeSegment(value)) {
    throw new AppReleaseArchiveError(`Invalid ${label}: ${value}`);
  }
}

function assertRuntimeAppId(value: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value)) {
    throw new AppReleaseArchiveError(`Invalid runtime app id: ${value}`);
  }
}

function assertInside(rootDir: string, targetPath: string): void {
  const relative = path.relative(rootDir, targetPath);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new AppReleaseArchiveError('Release entry escaped the staging area');
  }
}

function waitForEnd(stream: Readable): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    stream.once('end', resolve);
    stream.once('error', reject);
  });
}

function isExistingTargetError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException).code;
  return code === 'EEXIST' || code === 'ENOTEMPTY';
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
