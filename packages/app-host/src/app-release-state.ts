/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { isSafeSegment } from './app-release.ts';

export type AppReleaseStateSchemaVersion = 1;
export type AppReleaseStateDirectory = '.app-host';
export type AppReleaseStateFile = 'active-releases.json';

export const APP_RELEASE_STATE_SCHEMA_VERSION: AppReleaseStateSchemaVersion = 1;
export const APP_RELEASE_STATE_DIRECTORY: AppReleaseStateDirectory =
  '.app-host';
export const APP_RELEASE_STATE_FILE: AppReleaseStateFile =
  'active-releases.json';

export interface ActiveReleaseRecord {
  appId: string;
  releaseId: string;
  artifactSha256: string;
  activatedAt: string;
}

export interface AppReleaseStateDocument {
  schemaVersion: 1;
  releases: ActiveReleaseRecord[];
}

export interface SetActiveReleaseInput {
  appId: string;
  releaseId: string;
  artifactSha256: string;
}

export interface AppReleaseStateStoreOptions {
  appsDir: string;
  now?: () => Date;
}

export class AppReleaseStateStore {
  readonly stateDir: string;
  readonly stateFile: string;

  private readonly now: () => Date;
  private lock: Promise<void> = Promise.resolve();

  constructor(options: AppReleaseStateStoreOptions) {
    this.stateDir = path.join(
      path.resolve(options.appsDir),
      APP_RELEASE_STATE_DIRECTORY,
    );
    this.stateFile = path.join(this.stateDir, APP_RELEASE_STATE_FILE);
    this.now = options.now ?? (() => new Date());
  }

  async read(): Promise<AppReleaseStateDocument> {
    return this.runExclusive(() => this.readUnlocked());
  }

  async setActiveRelease(
    input: SetActiveReleaseInput,
  ): Promise<ActiveReleaseRecord> {
    const validated = validateRecord(
      {
        ...input,
        activatedAt: this.now().toISOString(),
      },
      'active release input',
    );

    return this.runExclusive(async (): Promise<ActiveReleaseRecord> => {
      const state = await this.readUnlocked();
      const existing = state.releases.find(
        (release) => release.appId === validated.appId,
      );

      if (
        existing &&
        existing.releaseId === validated.releaseId &&
        existing.artifactSha256 === validated.artifactSha256
      ) {
        return existing;
      }

      const record: ActiveReleaseRecord = validated;
      const nextState: AppReleaseStateDocument = {
        schemaVersion: APP_RELEASE_STATE_SCHEMA_VERSION,
        releases: [
          ...state.releases.filter((release) => release.appId !== record.appId),
          record,
        ].sort((left, right) => left.appId.localeCompare(right.appId)),
      };
      await this.writeUnlocked(nextState);
      return record;
    });
  }

  async clearActiveRelease(appId: string): Promise<boolean> {
    assertSafeSegment(appId, 'appId', 'active release input');

    return this.runExclusive(async (): Promise<boolean> => {
      const state = await this.readUnlocked();
      const releases = state.releases.filter(
        (release) => release.appId !== appId,
      );
      if (releases.length === state.releases.length) {
        return false;
      }

      await this.writeUnlocked({
        schemaVersion: APP_RELEASE_STATE_SCHEMA_VERSION,
        releases,
      });
      return true;
    });
  }

  private runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.lock.then(operation, operation);
    this.lock = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async readUnlocked(): Promise<AppReleaseStateDocument> {
    let content: string;
    try {
      content = await readFile(this.stateFile, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return emptyState();
      }
      throw error;
    }

    return parseAppReleaseState(content, this.stateFile);
  }

  private async writeUnlocked(state: AppReleaseStateDocument): Promise<void> {
    await mkdir(this.stateDir, { recursive: true, mode: 0o700 });
    const temporaryFile = path.join(
      this.stateDir,
      `.${APP_RELEASE_STATE_FILE}.${process.pid}.${randomUUID()}.tmp`,
    );

    try {
      await writeFile(temporaryFile, `${JSON.stringify(state, null, 2)}\n`, {
        encoding: 'utf8',
        flag: 'wx',
        mode: 0o600,
      });
      await rename(temporaryFile, this.stateFile);
    } catch (error) {
      await rm(temporaryFile, { force: true }).catch(() => undefined);
      throw error;
    }
  }
}

export function parseAppReleaseState(
  content: string,
  source: string = APP_RELEASE_STATE_FILE,
): AppReleaseStateDocument {
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
    throw new Error(`App release state ${source} must be a JSON object`);
  }
  assertExactKeys(value, ['schemaVersion', 'releases'], source);
  if (value.schemaVersion !== APP_RELEASE_STATE_SCHEMA_VERSION) {
    throw new Error(
      `App release state ${source} must use schemaVersion ${APP_RELEASE_STATE_SCHEMA_VERSION}`,
    );
  }
  if (!Array.isArray(value.releases)) {
    throw new Error(`App release state ${source} releases must be an array`);
  }

  const releases = value.releases.map((record, index) =>
    validateRecord(record, `${source} releases[${index}]`),
  );
  const appIds = new Set<string>();
  for (const release of releases) {
    if (appIds.has(release.appId)) {
      throw new Error(
        `App release state ${source} contains duplicate appId ${release.appId}`,
      );
    }
    appIds.add(release.appId);
  }

  return {
    schemaVersion: APP_RELEASE_STATE_SCHEMA_VERSION,
    releases,
  };
}

function emptyState(): AppReleaseStateDocument {
  return {
    schemaVersion: APP_RELEASE_STATE_SCHEMA_VERSION,
    releases: [],
  };
}

function validateRecord(value: unknown, source: string): ActiveReleaseRecord {
  if (!isRecord(value)) {
    throw new Error(`${source} must be a JSON object`);
  }
  assertExactKeys(
    value,
    ['appId', 'releaseId', 'artifactSha256', 'activatedAt'],
    source,
  );

  const appId = requiredString(value.appId, 'appId', source);
  const releaseId = requiredString(value.releaseId, 'releaseId', source);
  assertSafeSegment(appId, 'appId', source);
  assertSafeSegment(releaseId, 'releaseId', source);

  const artifactSha256 = requiredString(
    value.artifactSha256,
    'artifactSha256',
    source,
  ).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(artifactSha256)) {
    throw new Error(`${source} artifactSha256 must be a SHA-256 hex digest`);
  }

  const activatedAt = requiredString(value.activatedAt, 'activatedAt', source);
  const parsedActivatedAt = new Date(activatedAt);
  if (
    !Number.isFinite(parsedActivatedAt.getTime()) ||
    parsedActivatedAt.toISOString() !== activatedAt
  ) {
    throw new Error(`${source} activatedAt must be an ISO date string`);
  }

  return {
    appId,
    releaseId,
    artifactSha256,
    activatedAt,
  };
}

function requiredString(value: unknown, field: string, source: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${source} ${field} must be a non-empty string`);
  }
  return value.trim();
}

function assertSafeSegment(value: string, field: string, source: string): void {
  if (!isSafeSegment(value)) {
    throw new Error(`${source} ${field} must be a safe path segment`);
  }
}

function assertExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
  source: string,
): void {
  const expected = new Set(keys);
  const unexpected = Object.keys(value).filter((key) => !expected.has(key));
  const missing = keys.filter((key) => !(key in value));
  if (unexpected.length > 0 || missing.length > 0) {
    throw new Error(
      `${source} must contain exactly ${keys.join(', ')}${
        unexpected.length > 0 ? `; unexpected: ${unexpected.join(', ')}` : ''
      }${missing.length > 0 ? `; missing: ${missing.join(', ')}` : ''}`,
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
