/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { AppReleaseIntegrityError } from './errors.ts';
import type {
  AppBackendKind,
  AppIsolation,
  AppResourcePolicy,
  AppTier,
} from './app-types.ts';

export type AppReleaseManifestFile = 'app-release.json';

export const APP_RELEASE_MANIFEST_FILE: AppReleaseManifestFile =
  'app-release.json';

export interface AppReleaseManifest {
  schemaVersion: 1;
  appId: string;
  releaseId?: string;
  version: string;
  artifactSha256: string;
  createdAt?: string;
  runtime?: {
    backend?: AppBackendKind;
    isolation?: AppIsolation;
    tier?: AppTier;
    healthPath?: string;
    resourcePolicy?: AppResourcePolicy;
  };
}

export interface AppCatalogRelease {
  appId: string;
  id: string;
  version: string;
  createdAt: string | null;
  rootDir: string;
  manifestPath: string;
  manifest: AppReleaseManifest;
}

export interface ReadAppReleaseOptions {
  verifyArtifact?: boolean;
}

export async function readAppRelease(
  appsDir: string,
  appId: string,
  releaseId: string,
  options: ReadAppReleaseOptions = {},
): Promise<AppCatalogRelease> {
  assertSafeSegment(appId, 'app id');
  assertSafeSegment(releaseId, 'release id');

  const appRoot = path.resolve(appsDir, appId);
  const releasesRoot = path.resolve(appRoot, 'releases');
  const rootDir = path.resolve(releasesRoot, releaseId);
  assertInside(appsDir, appRoot);
  assertInside(appRoot, releasesRoot);
  assertInside(releasesRoot, rootDir);

  const manifestPath = path.join(rootDir, APP_RELEASE_MANIFEST_FILE);
  const manifest = parseReleaseManifest(
    await readFile(manifestPath, 'utf8'),
    manifestPath,
  );

  if (manifest.appId !== appId) {
    throw new Error(
      `Release ${releaseId} belongs to app ${manifest.appId}, not ${appId}`,
    );
  }
  if (manifest.releaseId && manifest.releaseId !== releaseId) {
    throw new Error(
      `Release manifest id ${manifest.releaseId} does not match directory ${releaseId}`,
    );
  }

  if (options.verifyArtifact !== false) {
    let artifactSha256: string;
    try {
      artifactSha256 = await hashArtifactDirectory(path.join(rootDir, 'dist'));
    } catch (error) {
      throw new AppReleaseIntegrityError(
        appId,
        releaseId,
        error instanceof Error ? error.message : String(error),
      );
    }
    if (artifactSha256 !== manifest.artifactSha256) {
      throw new AppReleaseIntegrityError(
        appId,
        releaseId,
        `expected ${manifest.artifactSha256}, received ${artifactSha256}`,
      );
    }
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

export function parseReleaseManifest(
  content: string,
  source: string = APP_RELEASE_MANIFEST_FILE,
): AppReleaseManifest {
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch (error) {
    throw new Error(
      `Invalid JSON in ${source}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }

  if (!isRecord(value)) {
    throw new Error(`Release manifest ${source} must be a JSON object`);
  }
  if (value.schemaVersion !== 1) {
    throw new Error(`Release manifest ${source} must use schemaVersion 1`);
  }

  const appId = requiredSegment(value.appId, 'appId', source);
  const releaseId = optionalSegment(value.releaseId, 'releaseId', source);
  const version = requiredText(value.version, 'version', source);
  const createdAt = optionalDate(value.createdAt, 'createdAt', source);
  const runtime = parseRuntime(value.runtime, source);
  const artifactSha256 = requiredSha256(
    value.artifactSha256,
    'artifactSha256',
    source,
  );

  return {
    schemaVersion: 1,
    appId,
    releaseId,
    version,
    artifactSha256,
    createdAt,
    runtime,
  };
}

export function isSafeSegment(value: string): boolean {
  return (
    /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(value) &&
    value !== '.' &&
    value !== '..'
  );
}

function parseRuntime(
  value: unknown,
  source: string,
): AppReleaseManifest['runtime'] {
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value)) {
    throw new Error(`Release manifest ${source} runtime must be an object`);
  }

  const backend = optionalEnum(
    value.backend,
    ['in-process', 'worker', 'process', 'external-service'],
    'backend',
    source,
  );
  const isolation = optionalEnum(
    value.isolation,
    ['in-process', 'worker', 'process', 'external-service'],
    'isolation',
    source,
  );
  const tier = optionalEnum(
    value.tier,
    ['cold', 'warm', 'hot', 'dedicated'],
    'tier',
    source,
  );
  const healthPath = optionalHealthPath(value.healthPath, source);
  const resourcePolicy = parseResourcePolicy(value.resourcePolicy, source);

  return {
    backend,
    isolation,
    tier,
    healthPath,
    resourcePolicy,
  };
}

function parseResourcePolicy(
  value: unknown,
  source: string,
): AppResourcePolicy | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value)) {
    throw new Error(
      `Release manifest ${source} resourcePolicy must be an object`,
    );
  }

  const result: AppResourcePolicy = {};
  for (const key of [
    'memoryLimitMb',
    'startupTimeoutMs',
    'requestTimeoutMs',
    'drainTimeoutMs',
    'idleTtlMs',
    'maxConcurrentRequests',
  ] as const) {
    const candidate = value[key];
    if (candidate === undefined) {
      continue;
    }
    if (
      typeof candidate !== 'number' ||
      !Number.isFinite(candidate) ||
      candidate <= 0
    ) {
      throw new Error(
        `Release manifest ${source} resourcePolicy.${key} must be a positive number`,
      );
    }
    result[key] = candidate;
  }

  return result;
}

function requiredSegment(
  value: unknown,
  field: string,
  source: string,
): string {
  const text = requiredText(value, field, source);
  if (!isSafeSegment(text)) {
    throw new Error(
      `Release manifest ${source} ${field} must be a safe path segment`,
    );
  }
  return text;
}

function optionalSegment(
  value: unknown,
  field: string,
  source: string,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return requiredSegment(value, field, source);
}

function requiredText(value: unknown, field: string, source: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 128) {
    throw new Error(
      `Release manifest ${source} ${field} must be a non-empty string of at most 128 characters`,
    );
  }
  return value.trim();
}

function requiredSha256(value: unknown, field: string, source: string): string {
  const checksum = requiredText(value, field, source).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(checksum)) {
    throw new Error(
      `Release manifest ${source} ${field} must be a SHA-256 hex digest`,
    );
  }
  return checksum;
}

function optionalDate(
  value: unknown,
  field: string,
  source: string,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    throw new Error(
      `Release manifest ${source} ${field} must be an ISO date string`,
    );
  }
  return new Date(value).toISOString();
}

function optionalHealthPath(
  value: unknown,
  source: string,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const healthPath = requiredText(value, 'runtime.healthPath', source);
  if (
    !healthPath.startsWith('/') ||
    healthPath.startsWith('//') ||
    healthPath.includes('?') ||
    healthPath.includes('#')
  ) {
    throw new Error(
      `Release manifest ${source} runtime.healthPath must be an absolute path without query or hash`,
    );
  }
  return healthPath;
}

function optionalEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  field: string,
  source: string,
): T | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new Error(
      `Release manifest ${source} runtime.${field} must be one of ${allowed.join(', ')}`,
    );
  }
  return value as T;
}

function assertSafeSegment(value: string, label: string): void {
  if (!isSafeSegment(value)) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
}

function assertInside(rootDir: string, targetPath: string): void {
  const relative = path.relative(rootDir, targetPath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Release path must stay inside ${rootDir}`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export async function hashArtifactDirectory(rootDir: string): Promise<string> {
  const hash = createHash('sha256');
  const files = await listArtifactFiles(rootDir);

  for (const file of files) {
    const relative = path.relative(rootDir, file).split(path.sep).join('/');
    hash.update(relative);
    hash.update('\0');
    hash.update(await readFile(file));
    hash.update('\0');
  }

  return hash.digest('hex');
}

async function listArtifactFiles(rootDir: string): Promise<string[]> {
  const files: string[] = [];

  const visit = async (directory: string): Promise<void> => {
    const entries = (await readdir(directory, { withFileTypes: true })).sort(
      (left, right) => left.name.localeCompare(right.name),
    );
    for (const entry of entries) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        throw new Error(
          `artifact must not contain symbolic links: ${entryPath}`,
        );
      }
      if (entry.isDirectory()) {
        await visit(entryPath);
      } else if (entry.isFile()) {
        files.push(entryPath);
      }
    }
  };

  await visit(rootDir);
  return files;
}
