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

export type AppDesiredState = 'running' | 'stopped';
export type AppRuntimeLifecycleState =
  'starting' | 'active' | 'stopping' | 'stopped' | 'failed';

export const APP_LIFECYCLE_STATE_FILE = 'app-lifecycle.json' as const;

export interface AppLifecycleStateRecord {
  appId: string;
  desiredState: AppDesiredState;
  updatedAt: string;
}

export interface AppLifecycleStateDocument {
  schemaVersion: 1;
  apps: AppLifecycleStateRecord[];
}

export interface AppLifecycleStateStoreOptions {
  stateDir: string;
  now?: () => Date;
}

export class AppLifecycleStateStore {
  readonly stateDir: string;
  readonly stateFile: string;

  private readonly now: () => Date;
  private lock: Promise<void> = Promise.resolve();

  constructor(options: AppLifecycleStateStoreOptions) {
    this.stateDir = path.resolve(options.stateDir);
    this.stateFile = path.join(this.stateDir, APP_LIFECYCLE_STATE_FILE);
    this.now = options.now ?? (() => new Date());
  }

  async read(): Promise<AppLifecycleStateDocument> {
    return this.runExclusive(() => this.readUnlocked());
  }

  async setDesiredState(
    appId: string,
    desiredState: AppDesiredState,
  ): Promise<AppLifecycleStateRecord> {
    assertSafeAppId(appId);
    return this.runExclusive(async (): Promise<AppLifecycleStateRecord> => {
      const state = await this.readUnlocked();
      const existing = state.apps.find((record) => record.appId === appId);
      if (existing?.desiredState === desiredState) {
        return existing;
      }

      const record: AppLifecycleStateRecord = {
        appId,
        desiredState,
        updatedAt: this.now().toISOString(),
      };
      await this.writeUnlocked({
        schemaVersion: 1,
        apps: [
          ...state.apps.filter((candidate) => candidate.appId !== appId),
          record,
        ].sort((left, right) => left.appId.localeCompare(right.appId)),
      });
      return record;
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

  private async readUnlocked(): Promise<AppLifecycleStateDocument> {
    let content: string;
    try {
      content = await readFile(this.stateFile, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { schemaVersion: 1, apps: [] };
      }
      throw error;
    }
    return parseAppLifecycleState(content, this.stateFile);
  }

  private async writeUnlocked(state: AppLifecycleStateDocument): Promise<void> {
    await mkdir(this.stateDir, { recursive: true, mode: 0o700 });
    const temporaryFile = path.join(
      this.stateDir,
      `.${APP_LIFECYCLE_STATE_FILE}.${process.pid}.${randomUUID()}.tmp`,
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

export function parseAppLifecycleState(
  content: string,
  source: string = APP_LIFECYCLE_STATE_FILE,
): AppLifecycleStateDocument {
  let value: unknown;
  try {
    value = JSON.parse(content) as unknown;
  } catch (error) {
    throw new Error(
      `Invalid JSON in ${source}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    !Array.isArray(value.apps)
  ) {
    throw new Error(`App lifecycle state ${source} is invalid`);
  }
  assertExactKeys(value, ['schemaVersion', 'apps'], source);
  const apps = value.apps.map((record, index) =>
    validateRecord(record, `${source} apps[${index}]`),
  );
  if (new Set(apps.map((record) => record.appId)).size !== apps.length) {
    throw new Error(`App lifecycle state ${source} contains duplicate app IDs`);
  }
  return { schemaVersion: 1, apps };
}

function validateRecord(
  value: unknown,
  source: string,
): AppLifecycleStateRecord {
  if (!isRecord(value)) {
    throw new Error(`${source} must be a JSON object`);
  }
  assertExactKeys(value, ['appId', 'desiredState', 'updatedAt'], source);
  if (typeof value.appId !== 'string') {
    throw new Error(`${source} appId must be a string`);
  }
  assertSafeAppId(value.appId);
  if (value.desiredState !== 'running' && value.desiredState !== 'stopped') {
    throw new Error(`${source} desiredState must be running or stopped`);
  }
  if (
    typeof value.updatedAt !== 'string' ||
    new Date(value.updatedAt).toISOString() !== value.updatedAt
  ) {
    throw new Error(`${source} updatedAt must be an ISO date string`);
  }
  return {
    appId: value.appId,
    desiredState: value.desiredState,
    updatedAt: value.updatedAt,
  };
}

function assertSafeAppId(appId: string): void {
  if (!isSafeSegment(appId)) {
    throw new Error(`Invalid app lifecycle appId ${appId}`);
  }
}

function assertExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
  source: string,
): void {
  const expected = new Set(keys);
  const unexpected = Object.keys(value).filter((key) => !expected.has(key));
  if (unexpected.length > 0 || Object.keys(value).length !== keys.length) {
    throw new Error(`App lifecycle state ${source} has unexpected fields`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
