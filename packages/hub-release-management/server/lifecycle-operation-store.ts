import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { AppLifecycleOperationRecord } from './types.js';

export interface AppLifecycleOperationStore {
  list(appId?: string): Promise<AppLifecycleOperationRecord[]>;
  findByIdempotencyKey(
    appId: string,
    idempotencyKey: string,
  ): Promise<AppLifecycleOperationRecord | null>;
  save(record: AppLifecycleOperationRecord): Promise<void>;
}

export class InMemoryAppLifecycleOperationStore implements AppLifecycleOperationStore {
  private readonly records: AppLifecycleOperationRecord[] = [];

  async list(appId?: string): Promise<AppLifecycleOperationRecord[]> {
    return this.records
      .filter((record) => !appId || record.appId === appId)
      .sort((left, right) => right.requestedAt.localeCompare(left.requestedAt));
  }

  async findByIdempotencyKey(
    appId: string,
    idempotencyKey: string,
  ): Promise<AppLifecycleOperationRecord | null> {
    return (
      this.records.find(
        (record) =>
          record.appId === appId && record.idempotencyKey === idempotencyKey,
      ) ?? null
    );
  }

  async save(record: AppLifecycleOperationRecord): Promise<void> {
    const index = this.records.findIndex(
      (candidate) => candidate.id === record.id,
    );
    if (index >= 0) {
      this.records[index] = structuredClone(record);
    } else {
      this.records.push(structuredClone(record));
    }
  }
}

interface LifecycleOperationStoreFile {
  schemaVersion: 1;
  operations: AppLifecycleOperationRecord[];
}

export class JsonAppLifecycleOperationStore implements AppLifecycleOperationStore {
  private lock: Promise<unknown> = Promise.resolve();

  constructor(readonly filePath: string) {}

  async list(appId?: string): Promise<AppLifecycleOperationRecord[]> {
    return this.withLock(async (): Promise<AppLifecycleOperationRecord[]> => {
      const store = await this.read();
      return store.operations
        .filter((record) => !appId || record.appId === appId)
        .sort((left, right) =>
          right.requestedAt.localeCompare(left.requestedAt),
        );
    });
  }

  async findByIdempotencyKey(
    appId: string,
    idempotencyKey: string,
  ): Promise<AppLifecycleOperationRecord | null> {
    return this.withLock(
      async (): Promise<AppLifecycleOperationRecord | null> => {
        const store = await this.read();
        return (
          store.operations.find(
            (record) =>
              record.appId === appId &&
              record.idempotencyKey === idempotencyKey,
          ) ?? null
        );
      },
    );
  }

  async save(record: AppLifecycleOperationRecord): Promise<void> {
    await this.withLock(async (): Promise<void> => {
      const store = await this.read();
      const index = store.operations.findIndex(
        (candidate) => candidate.id === record.id,
      );
      if (index >= 0) {
        store.operations[index] = record;
      } else {
        store.operations.push(record);
      }
      await this.write(store);
    });
  }

  private async read(): Promise<LifecycleOperationStoreFile> {
    let content: string;
    try {
      content = await readFile(this.filePath, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { schemaVersion: 1, operations: [] };
      }
      throw error;
    }
    const value = JSON.parse(content) as unknown;
    if (!isStoreFile(value)) {
      throw new Error(`Invalid lifecycle operation store at ${this.filePath}`);
    }
    return value;
  }

  private async write(store: LifecycleOperationStoreFile): Promise<void> {
    const directory = path.dirname(this.filePath);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const temporaryPath = path.join(
      directory,
      `.${path.basename(this.filePath)}.${randomUUID()}.tmp`,
    );
    try {
      await writeFile(temporaryPath, `${JSON.stringify(store, null, 2)}\n`, {
        mode: 0o600,
        flag: 'wx',
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

function isStoreFile(value: unknown): value is LifecycleOperationStoreFile {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return record.schemaVersion === 1 && Array.isArray(record.operations);
}
