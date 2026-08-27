import { randomUUID } from 'node:crypto';
import {
  access,
  mkdir,
  open,
  readFile,
  rename,
  rm,
  stat,
} from 'node:fs/promises';
import path from 'node:path';
import { extract, list } from 'tar';

import { AppRegistryError } from './errors.ts';
import {
  isSafeSegment,
  hashArtifactDirectory,
  parseReleaseManifest,
  readAppRelease,
  type AppReleaseManifest,
} from './app-release.ts';

export const DEFAULT_MAX_RELEASE_ARCHIVE_BYTES: number = 512 * 1024 * 1024;
export const DEFAULT_MAX_RELEASE_EXTRACTED_BYTES: number = 1024 * 1024 * 1024;
export const DEFAULT_MAX_RELEASE_ENTRIES: number = 100_000;

export interface InstallAppReleaseArchiveOptions {
  appsDir: string;
  appId: string;
  releaseId: string;
  source: AsyncIterable<Uint8Array | string>;
  maxArchiveBytes?: number;
  maxExtractedBytes?: number;
  maxEntries?: number;
}

export interface InstalledAppRelease {
  status: 'created' | 'unchanged';
  appId: string;
  releaseId: string;
  version: string;
  artifactSha256: string;
  archiveBytes: number;
}

interface ArchiveInspection {
  entries: number;
  extractedBytes: number;
}

/**
 * Installs one immutable App release from a gzip-compressed tar stream.
 *
 * The archive is first written outside the release directory, inspected for
 * traversal/link entries and expansion limits, then extracted into a staging
 * directory. The existing App Host manifest and artifact checksum contract is
 * verified before the staging directory is atomically renamed into place.
 */
export async function installAppReleaseArchive(
  options: InstallAppReleaseArchiveOptions,
): Promise<InstalledAppRelease> {
  assertSafeIdentifier(options.appId, 'app id');
  assertSafeIdentifier(options.releaseId, 'release id');
  const appsDir = path.resolve(options.appsDir);
  const appRoot = path.join(appsDir, options.appId);
  const releasesRoot = path.join(appRoot, 'releases');
  const stateRoot = path.join(appsDir, '.app-host', 'uploads');
  const operationId = randomUUID();
  const archivePath = path.join(stateRoot, `${operationId}.tgz`);
  const stagingRoot = path.join(
    releasesRoot,
    `.${options.releaseId}.${operationId}`,
  );
  const releaseRoot = path.join(releasesRoot, options.releaseId);

  await mkdir(stateRoot, { recursive: true, mode: 0o700 });
  await mkdir(releasesRoot, { recursive: true });
  try {
    const archiveBytes = await writeLimitedArchive(
      archivePath,
      options.source,
      positiveLimit(
        options.maxArchiveBytes,
        DEFAULT_MAX_RELEASE_ARCHIVE_BYTES,
        'maxArchiveBytes',
      ),
    );
    await inspectArchive(archivePath, {
      maxEntries: positiveLimit(
        options.maxEntries,
        DEFAULT_MAX_RELEASE_ENTRIES,
        'maxEntries',
      ),
      maxExtractedBytes: positiveLimit(
        options.maxExtractedBytes,
        DEFAULT_MAX_RELEASE_EXTRACTED_BYTES,
        'maxExtractedBytes',
      ),
    });
    await mkdir(stagingRoot, { recursive: false, mode: 0o700 });
    await extract({
      cwd: stagingRoot,
      file: archivePath,
      gzip: true,
      noChmod: true,
      preservePaths: false,
      strict: true,
      unlink: true,
      filter: (entryPath, entry) => isSafeArchiveEntry(entryPath, entry),
    });
    const manifest = await validateStagedRelease(
      stagingRoot,
      options.appId,
      options.releaseId,
    );

    if (await exists(releaseRoot)) {
      const existing = await validateExistingRelease(
        appsDir,
        releaseRoot,
        options.appId,
        options.releaseId,
      );
      if (
        !(await releaseMetadataMatches(
          stagingRoot,
          releaseRoot,
          manifest,
          existing,
        ))
      ) {
        throw uploadError(
          `Release "${options.releaseId}" for app "${options.appId}" already exists with different contents`,
          409,
          'APP_RELEASE_UPLOAD_CONFLICT',
        );
      }
      return toInstalledRelease('unchanged', manifest, archiveBytes);
    }

    try {
      await rename(stagingRoot, releaseRoot);
    } catch (error) {
      if (
        !['EEXIST', 'ENOTEMPTY'].includes(
          (error as NodeJS.ErrnoException).code ?? '',
        )
      ) {
        throw error;
      }
      const existing = await validateExistingRelease(
        appsDir,
        releaseRoot,
        options.appId,
        options.releaseId,
      );
      if (
        !(await releaseMetadataMatches(
          stagingRoot,
          releaseRoot,
          manifest,
          existing,
        ))
      ) {
        throw uploadError(
          `Release "${options.releaseId}" for app "${options.appId}" was concurrently installed with different contents`,
          409,
          'APP_RELEASE_UPLOAD_CONFLICT',
        );
      }
      return toInstalledRelease('unchanged', manifest, archiveBytes);
    }

    return toInstalledRelease('created', manifest, archiveBytes);
  } catch (error) {
    if (error instanceof AppRegistryError) throw error;
    throw uploadError(
      error instanceof Error ? error.message : String(error),
      400,
      'APP_RELEASE_UPLOAD_INVALID',
      error,
    );
  } finally {
    await Promise.all([
      rm(archivePath, { force: true }),
      rm(stagingRoot, { force: true, recursive: true }),
    ]);
  }
}

async function writeLimitedArchive(
  archivePath: string,
  source: AsyncIterable<Uint8Array | string>,
  maxBytes: number,
): Promise<number> {
  const file = await open(archivePath, 'wx', 0o600);
  let size = 0;
  try {
    for await (const chunk of source) {
      const bytes = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
      size += bytes.byteLength;
      if (size > maxBytes) {
        throw uploadError(
          `Release archive exceeds the ${maxBytes}-byte upload limit`,
          413,
          'APP_RELEASE_ARCHIVE_TOO_LARGE',
        );
      }
      let offset = 0;
      while (offset < bytes.byteLength) {
        const { bytesWritten } = await file.write(
          bytes,
          offset,
          bytes.byteLength - offset,
        );
        offset += bytesWritten;
      }
    }
  } finally {
    await file.close();
  }
  if (size === 0) {
    throw uploadError(
      'Release archive is empty',
      400,
      'APP_RELEASE_ARCHIVE_EMPTY',
    );
  }
  return size;
}

async function inspectArchive(
  archivePath: string,
  limits: { maxEntries: number; maxExtractedBytes: number },
): Promise<ArchiveInspection> {
  let entries = 0;
  let extractedBytes = 0;
  let validationError: AppRegistryError | undefined;
  await list({
    file: archivePath,
    gzip: true,
    strict: true,
    maxDecompressionRatio: 200,
    filter: (entryPath, entry) => {
      if (validationError) return false;
      if (!isSafeArchiveEntry(entryPath, entry)) {
        validationError = uploadError(
          `Release archive contains an unsafe entry: ${entryPath}`,
          400,
          'APP_RELEASE_ARCHIVE_UNSAFE',
        );
        return false;
      }
      entries += 1;
      extractedBytes += entry.size;
      if (entries > limits.maxEntries) {
        validationError = uploadError(
          `Release archive exceeds the ${limits.maxEntries}-entry limit`,
          413,
          'APP_RELEASE_ARCHIVE_TOO_MANY_FILES',
        );
        return false;
      }
      if (extractedBytes > limits.maxExtractedBytes) {
        validationError = uploadError(
          `Release archive exceeds the ${limits.maxExtractedBytes}-byte extracted limit`,
          413,
          'APP_RELEASE_EXTRACTED_TOO_LARGE',
        );
        return false;
      }
      return true;
    },
  });
  if (validationError) throw validationError;
  if (entries === 0) {
    throw uploadError(
      'Release archive contains no files',
      400,
      'APP_RELEASE_ARCHIVE_EMPTY',
    );
  }
  return { entries, extractedBytes };
}

function isSafeArchiveEntry(entryPath: string, entry: unknown): boolean {
  const normalized = entryPath.replace(/\\/g, '/').replace(/^\.\//, '');
  const parts = normalized.split('/').filter(Boolean);
  const record =
    entry && typeof entry === 'object'
      ? (entry as { type?: string; linkpath?: string })
      : {};
  const entryType = record.type;
  return Boolean(
    normalized &&
    !entryPath.includes('\\') &&
    !entryPath.includes('\0') &&
    !normalized.startsWith('/') &&
    !/^[a-zA-Z]:/.test(normalized) &&
    !parts.includes('..') &&
    !parts.includes('.') &&
    (entryType === undefined ||
      entryType === 'File' ||
      entryType === 'OldFile' ||
      entryType === 'Directory' ||
      entryType === 'ExtendedHeader' ||
      entryType === 'GlobalExtendedHeader' ||
      entryType === 'NextFileHasLongPath' ||
      entryType === 'NextFileHasLongLinkpath') &&
    !record.linkpath &&
    isAllowedReleasePayloadEntry(parts, entryType),
  );
}

function isAllowedReleasePayloadEntry(
  parts: string[],
  entryType: string | undefined,
): boolean {
  if (
    entryType === 'ExtendedHeader' ||
    entryType === 'GlobalExtendedHeader' ||
    entryType === 'NextFileHasLongPath' ||
    entryType === 'NextFileHasLongLinkpath'
  ) {
    return true;
  }
  return (
    parts[0] === 'dist' ||
    (parts.length === 1 &&
      (parts[0] === 'app-release.json' || parts[0] === 'package.json'))
  );
}

async function validateStagedRelease(
  stagingRoot: string,
  appId: string,
  releaseId: string,
): Promise<AppReleaseManifest> {
  const manifestPath = path.join(stagingRoot, 'app-release.json');
  const manifest = parseReleaseManifest(
    await readFile(manifestPath, 'utf8'),
    manifestPath,
  );
  if (manifest.appId !== appId || manifest.releaseId !== releaseId) {
    throw uploadError(
      `Release archive identity ${manifest.appId}/${manifest.releaseId ?? '(missing)'} does not match ${appId}/${releaseId}`,
      400,
      'APP_RELEASE_UPLOAD_IDENTITY_MISMATCH',
    );
  }
  await requireFile(path.join(stagingRoot, 'package.json'));
  JSON.parse(await readFile(path.join(stagingRoot, 'package.json'), 'utf8'));
  await requireFile(path.join(stagingRoot, 'dist', 'server', 'embedded.js'));
  const artifactSha256 = await hashArtifactDirectory(
    path.join(stagingRoot, 'dist'),
  );
  if (artifactSha256 !== manifest.artifactSha256) {
    throw uploadError(
      `Release artifact checksum mismatch: expected ${manifest.artifactSha256}, received ${artifactSha256}`,
      409,
      'APP_RELEASE_INTEGRITY_FAILED',
    );
  }
  return manifest;
}

async function validateExistingRelease(
  appsDir: string,
  releaseRoot: string,
  appId: string,
  releaseId: string,
): Promise<AppReleaseManifest> {
  const release = await readAppRelease(appsDir, appId, releaseId);
  await requireFile(path.join(releaseRoot, 'package.json'));
  await requireFile(path.join(releaseRoot, 'dist', 'server', 'embedded.js'));
  return release.manifest;
}

async function releaseMetadataMatches(
  stagedRoot: string,
  existingRoot: string,
  stagedManifest: AppReleaseManifest,
  existingManifest: AppReleaseManifest,
): Promise<boolean> {
  if (
    JSON.stringify(withoutCreatedAt(stagedManifest)) !==
    JSON.stringify(withoutCreatedAt(existingManifest))
  ) {
    return false;
  }
  const [stagedPackage, existingPackage] = await Promise.all([
    readFile(path.join(stagedRoot, 'package.json'), 'utf8'),
    readFile(path.join(existingRoot, 'package.json'), 'utf8'),
  ]);
  return canonicalJson(stagedPackage) === canonicalJson(existingPackage);
}

function withoutCreatedAt(manifest: AppReleaseManifest): AppReleaseManifest {
  const { createdAt: _createdAt, ...stable } = manifest;
  return stable;
}

function canonicalJson(content: string): string {
  return JSON.stringify(JSON.parse(content) as unknown, objectKeySorter);
}

function objectKeySorter(_key: string, value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  );
}

async function requireFile(filePath: string): Promise<void> {
  const fileStat = await stat(filePath);
  if (!fileStat.isFile()) {
    throw new Error(`Required release file is not a file: ${filePath}`);
  }
}

async function exists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

function assertSafeIdentifier(value: string, label: string): void {
  if (!isSafeSegment(value)) {
    throw uploadError(
      `Invalid ${label}: ${value}`,
      400,
      'APP_RELEASE_UPLOAD_INVALID_ID',
    );
  }
}

function positiveLimit(
  configured: number | undefined,
  fallback: number,
  name: string,
): number {
  const value = configured ?? fallback;
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive safe integer`);
  }
  return value;
}

function toInstalledRelease(
  status: InstalledAppRelease['status'],
  manifest: AppReleaseManifest,
  archiveBytes: number,
): InstalledAppRelease {
  return {
    status,
    appId: manifest.appId,
    releaseId: manifest.releaseId as string,
    version: manifest.version,
    artifactSha256: manifest.artifactSha256,
    archiveBytes,
  };
}

function uploadError(
  message: string,
  status: number,
  code: string,
  cause?: unknown,
): AppRegistryError {
  return new AppRegistryError(message, { status, code, cause });
}
