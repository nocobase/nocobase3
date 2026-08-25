import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import { SettingsError } from './errors.js';
import type {
  SettingsAuditRecord,
  SettingsStoreFile,
  StorageSettingsRecord,
} from './types.js';

export interface SettingsStore {
  getStorage(appId: string): Promise<StorageSettingsRecord | null>;
  saveStorage(
    record: StorageSettingsRecord,
    audit: Omit<SettingsAuditRecord, 'id'>,
  ): Promise<void>;
  appendAudit(record: Omit<SettingsAuditRecord, 'id'>): Promise<void>;
}

export class JsonSettingsStore implements SettingsStore {
  private lock: Promise<unknown> = Promise.resolve();

  constructor(readonly filePath: string) {}

  async getStorage(appId: string): Promise<StorageSettingsRecord | null> {
    return this.withLock(async () => {
      const store = await this.read();
      return store.storage.find((record) => record.appId === appId) ?? null;
    });
  }

  async saveStorage(
    record: StorageSettingsRecord,
    audit: Omit<SettingsAuditRecord, 'id'>,
  ): Promise<void> {
    await this.withLock(async () => {
      const store = await this.read();
      const index = store.storage.findIndex(
        (candidate) => candidate.appId === record.appId,
      );
      if (index >= 0) {
        store.storage[index] = record;
      } else {
        store.storage.push(record);
      }
      store.audit.push({ id: randomUUID(), ...audit });
      store.audit = store.audit.slice(-1000);
      await this.write(store);
    });
  }

  async appendAudit(record: Omit<SettingsAuditRecord, 'id'>): Promise<void> {
    await this.withLock(async () => {
      const store = await this.read();
      store.audit.push({ id: randomUUID(), ...record });
      store.audit = store.audit.slice(-1000);
      await this.write(store);
    });
  }

  private async read(): Promise<SettingsStoreFile> {
    let content: string;
    try {
      content = await readFile(this.filePath, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { schemaVersion: 1, storage: [], audit: [] };
      }
      throw new SettingsError('无法读取配置存储', {
        status: 503,
        code: 'SETTINGS_STORE_READ_FAILED',
        cause: error,
      });
    }

    try {
      const value = JSON.parse(content) as unknown;
      if (!isSettingsStoreFile(value)) throw new Error('invalid schema');
      return value;
    } catch (error) {
      throw new SettingsError('配置存储文件格式无效', {
        status: 500,
        code: 'SETTINGS_STORE_INVALID',
        cause: error,
      });
    }
  }

  private async write(store: SettingsStoreFile): Promise<void> {
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

function isSettingsStoreFile(value: unknown): value is SettingsStoreFile {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    record.schemaVersion === 1 &&
    Array.isArray(record.storage) &&
    Array.isArray(record.audit)
  );
}
