import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { ManagedAppSummary, ReleaseActor } from './types.js';

export interface ManagedAppRecord extends ManagedAppSummary {
  deployTokenHash: string;
  deployTokenIssuedAt: string;
  deployTokenIssuedBy: ReleaseActor;
}

export interface ManagedAppStore {
  list(): Promise<ManagedAppRecord[]>;
  find(appId: string): Promise<ManagedAppRecord | null>;
  create(record: ManagedAppRecord): Promise<boolean>;
  save(record: ManagedAppRecord): Promise<void>;
}

interface ManagedAppStoreFile {
  schemaVersion: 1;
  apps: ManagedAppRecord[];
}

export class JsonManagedAppStore implements ManagedAppStore {
  private lock: Promise<unknown> = Promise.resolve();

  constructor(readonly filePath: string) {}

  async list(): Promise<ManagedAppRecord[]> {
    return this.withLock(async (): Promise<ManagedAppRecord[]> => {
      const store = await this.read();
      return store.apps
        .map((record) => structuredClone(record))
        .sort((left, right) => left.appId.localeCompare(right.appId));
    });
  }

  async find(appId: string): Promise<ManagedAppRecord | null> {
    return this.withLock(async (): Promise<ManagedAppRecord | null> => {
      const store = await this.read();
      const record = store.apps.find((candidate) => candidate.appId === appId);
      return record ? structuredClone(record) : null;
    });
  }

  async create(record: ManagedAppRecord): Promise<boolean> {
    return this.withLock(async (): Promise<boolean> => {
      const store = await this.read();
      if (store.apps.some((candidate) => candidate.appId === record.appId)) {
        return false;
      }
      store.apps.push(structuredClone(record));
      await this.write(store);
      return true;
    });
  }

  async save(record: ManagedAppRecord): Promise<void> {
    await this.withLock(async (): Promise<void> => {
      const store = await this.read();
      const index = store.apps.findIndex(
        (candidate) => candidate.appId === record.appId,
      );
      if (index < 0) {
        throw new Error(`Managed App ${record.appId} does not exist`);
      }
      store.apps[index] = structuredClone(record);
      await this.write(store);
    });
  }

  private async read(): Promise<ManagedAppStoreFile> {
    let content: string;
    try {
      content = await readFile(this.filePath, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { schemaVersion: 1, apps: [] };
      }
      throw error;
    }

    const value = JSON.parse(content) as unknown;
    if (!isManagedAppStoreFile(value)) {
      throw new Error(`Invalid managed App store at ${this.filePath}`);
    }
    return value;
  }

  private async write(store: ManagedAppStoreFile): Promise<void> {
    const directory = path.dirname(this.filePath);
    await mkdir(directory, { recursive: true });
    const temporaryPath = path.join(
      directory,
      `.${path.basename(this.filePath)}.${randomUUID()}.tmp`,
    );
    try {
      await writeFile(temporaryPath, `${JSON.stringify(store, null, 2)}\n`, {
        encoding: 'utf8',
        mode: 0o600,
      });
      await rename(temporaryPath, this.filePath);
    } catch (error) {
      await rm(temporaryPath, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  private async withLock<T>(operation: () => Promise<T>): Promise<T> {
    const current = this.lock.catch(() => undefined).then(operation);
    this.lock = current;
    return current;
  }
}

function isManagedAppStoreFile(value: unknown): value is ManagedAppStoreFile {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    record.schemaVersion === 1 &&
    Array.isArray(record.apps) &&
    record.apps.every(isManagedAppRecord)
  );
}

function isManagedAppRecord(value: unknown): value is ManagedAppRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.appId === 'string' &&
    typeof record.name === 'string' &&
    record.status === 'not-deployed' &&
    typeof record.createdAt === 'string' &&
    isReleaseActor(record.createdBy) &&
    typeof record.deployTokenHash === 'string' &&
    /^[a-f0-9]{64}$/i.test(record.deployTokenHash) &&
    typeof record.deployTokenIssuedAt === 'string' &&
    isReleaseActor(record.deployTokenIssuedBy)
  );
}

function isReleaseActor(value: unknown): value is ReleaseActor {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const actor = value as Record<string, unknown>;
  return (
    typeof actor.id === 'string' &&
    typeof actor.name === 'string' &&
    typeof actor.role === 'string'
  );
}
