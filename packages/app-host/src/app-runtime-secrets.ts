/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { randomBytes, randomUUID } from 'node:crypto';
import {
  chmod,
  lstat,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { isSafeSegment } from './app-release.ts';

type AppRuntimeSecretSchemaVersion = 1;
type AppRuntimeSecretFile = 'runtime-secrets.json';

const APP_RUNTIME_SECRET_SCHEMA_VERSION: AppRuntimeSecretSchemaVersion = 1;
const APP_RUNTIME_SECRET_FILE: AppRuntimeSecretFile = 'runtime-secrets.json';

interface AppRuntimeSecretRecord {
  appId: string;
  authSecret: string;
}

interface AppRuntimeSecretDocument {
  schemaVersion: 1;
  secrets: AppRuntimeSecretRecord[];
}

export class AppRuntimeSecretStore {
  readonly stateFile: string;

  private lock: Promise<void> = Promise.resolve();

  constructor(stateDir: string) {
    this.stateFile = path.join(path.resolve(stateDir), APP_RUNTIME_SECRET_FILE);
  }

  async getOrCreate(appId: string): Promise<string> {
    if (!isSafeSegment(appId)) {
      throw new Error(`Invalid app id: ${appId}`);
    }

    return this.runExclusive(async (): Promise<string> => {
      const state = await this.readUnlocked();
      const existing = state.secrets.find((record) => record.appId === appId);
      if (existing) {
        return existing.authSecret;
      }

      const authSecret = randomBytes(32).toString('hex');
      await this.writeUnlocked({
        schemaVersion: APP_RUNTIME_SECRET_SCHEMA_VERSION,
        secrets: [...state.secrets, { appId, authSecret }].sort((left, right) =>
          left.appId.localeCompare(right.appId),
        ),
      });
      return authSecret;
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

  private async readUnlocked(): Promise<AppRuntimeSecretDocument> {
    let content: string;
    try {
      const fileStat = await lstat(this.stateFile);
      if (fileStat.isSymbolicLink() || !fileStat.isFile()) {
        throw new Error(`Runtime secret store ${this.stateFile} is not a file`);
      }
      content = await readFile(this.stateFile, 'utf8');
      await chmod(this.stateFile, 0o600);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return {
          schemaVersion: APP_RUNTIME_SECRET_SCHEMA_VERSION,
          secrets: [],
        };
      }
      throw error;
    }

    return parseDocument(content, this.stateFile);
  }

  private async writeUnlocked(state: AppRuntimeSecretDocument): Promise<void> {
    const stateDir = path.dirname(this.stateFile);
    await mkdir(stateDir, { recursive: true, mode: 0o700 });
    const directoryStat = await lstat(stateDir);
    if (directoryStat.isSymbolicLink() || !directoryStat.isDirectory()) {
      throw new Error(`Runtime secret directory ${stateDir} is not safe`);
    }
    const temporaryFile = path.join(
      stateDir,
      `.${APP_RUNTIME_SECRET_FILE}.${process.pid}.${randomUUID()}.tmp`,
    );

    try {
      await writeFile(temporaryFile, `${JSON.stringify(state, null, 2)}\n`, {
        encoding: 'utf8',
        flag: 'wx',
        mode: 0o600,
      });
      await rename(temporaryFile, this.stateFile);
      await chmod(this.stateFile, 0o600);
    } catch (error) {
      await rm(temporaryFile, { force: true }).catch(() => undefined);
      throw error;
    }
  }
}

function parseDocument(
  content: string,
  source: string,
): AppRuntimeSecretDocument {
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch (error) {
    throw new Error(`Invalid JSON in ${source}`, { cause: error });
  }
  if (!isRecord(value) || value.schemaVersion !== 1) {
    throw new Error(`Runtime secret store ${source} must use schemaVersion 1`);
  }
  if (!Array.isArray(value.secrets)) {
    throw new Error(`Runtime secret store ${source} secrets must be an array`);
  }

  const appIds = new Set<string>();
  const secrets = value.secrets.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new Error(`Runtime secret ${source} secrets[${index}] is invalid`);
    }
    if (
      typeof entry.appId !== 'string' ||
      !isSafeSegment(entry.appId) ||
      typeof entry.authSecret !== 'string' ||
      !/^[a-f0-9]{64}$/.test(entry.authSecret)
    ) {
      throw new Error(`Runtime secret ${source} secrets[${index}] is invalid`);
    }
    if (appIds.has(entry.appId)) {
      throw new Error(`Runtime secret store ${source} has duplicate app ids`);
    }
    appIds.add(entry.appId);
    return {
      appId: entry.appId,
      authSecret: entry.authSecret,
    };
  });
  return {
    schemaVersion: APP_RUNTIME_SECRET_SCHEMA_VERSION,
    secrets,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
