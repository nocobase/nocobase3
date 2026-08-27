import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { ManagedAppRecord } from '../shared/types.js';

export interface ManagedAppStore {
  list(): Promise<ManagedAppRecord[]>;
  findById(id: string): Promise<ManagedAppRecord | null>;
  save(record: ManagedAppRecord): Promise<void>;
  remove(id: string): Promise<boolean>;
}

interface ManagedAppStoreFile {
  schemaVersion: 1;
  apps: ManagedAppRecord[];
}

export class JsonManagedAppStore implements ManagedAppStore {
  private lock: Promise<unknown> = Promise.resolve();

  constructor(readonly filePath: string) {}

  async list(): Promise<ManagedAppRecord[]> {
    return this.withLock(async () => {
      const store = await this.read();
      return [...store.apps].sort((left, right) =>
        left.id.localeCompare(right.id),
      );
    });
  }

  async findById(id: string): Promise<ManagedAppRecord | null> {
    return this.withLock(async () => {
      const store = await this.read();
      return store.apps.find((app) => app.id === id) ?? null;
    });
  }

  async save(record: ManagedAppRecord): Promise<void> {
    await this.withLock(async () => {
      const store = await this.read();
      const index = store.apps.findIndex((app) => app.id === record.id);
      if (index >= 0) {
        store.apps[index] = record;
      } else {
        store.apps.push(record);
      }
      await this.write(store);
    });
  }

  async remove(id: string): Promise<boolean> {
    return this.withLock(async () => {
      const store = await this.read();
      const apps = store.apps.filter((app) => app.id !== id);
      if (apps.length === store.apps.length) return false;
      await this.write({ ...store, apps });
      return true;
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
      throw new Error(`Invalid managed app store at ${this.filePath}`);
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
    await writeFile(temporaryPath, `${JSON.stringify(store, null, 2)}\n`, {
      mode: 0o600,
    });
    await rename(temporaryPath, this.filePath);
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
  const app = value as Record<string, unknown>;
  const createdBy = app.createdBy;
  const actor =
    createdBy && typeof createdBy === 'object' && !Array.isArray(createdBy)
      ? (createdBy as Record<string, unknown>)
      : null;
  return Boolean(
    typeof app.id === 'string' &&
    typeof app.name === 'string' &&
    (app.type === 'app' || app.type === 'portal') &&
    typeof app.basePath === 'string' &&
    typeof app.createdAt === 'string' &&
    actor &&
    typeof actor.id === 'string' &&
    typeof actor.name === 'string' &&
    typeof actor.role === 'string',
  );
}
