import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { DeploymentKind, DeploymentRecord } from './types.js';

export interface DeploymentStore {
  list(appId?: string): Promise<DeploymentRecord[]>;
  findByIdempotencyKey(
    appId: string,
    kind: DeploymentKind,
    idempotencyKey: string,
  ): Promise<DeploymentRecord | null>;
  save(record: DeploymentRecord): Promise<void>;
}

interface DeploymentStoreFile {
  schemaVersion: 1;
  deployments: DeploymentRecord[];
}

export class JsonDeploymentStore implements DeploymentStore {
  private lock: Promise<unknown> = Promise.resolve();

  constructor(readonly filePath: string) {}

  async list(appId?: string): Promise<DeploymentRecord[]> {
    return this.withLock(async () => {
      const store = await this.read();
      return store.deployments
        .filter((record) => !appId || record.appId === appId)
        .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
    });
  }

  async findByIdempotencyKey(
    appId: string,
    kind: DeploymentKind,
    idempotencyKey: string,
  ): Promise<DeploymentRecord | null> {
    return this.withLock(async () => {
      const store = await this.read();
      return (
        store.deployments.find(
          (record) =>
            record.appId === appId &&
            record.kind === kind &&
            record.idempotencyKey === idempotencyKey,
        ) ?? null
      );
    });
  }

  async save(record: DeploymentRecord): Promise<void> {
    await this.withLock(async () => {
      const store = await this.read();
      const index = store.deployments.findIndex(
        (candidate) => candidate.id === record.id,
      );
      if (index >= 0) {
        store.deployments[index] = record;
      } else {
        store.deployments.push(record);
      }
      await this.write(store);
    });
  }

  private async read(): Promise<DeploymentStoreFile> {
    let content: string;
    try {
      content = await readFile(this.filePath, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { schemaVersion: 1, deployments: [] };
      }
      throw error;
    }

    const value = JSON.parse(content) as unknown;
    if (!isStoreFile(value)) {
      throw new Error(`Invalid deployment store at ${this.filePath}`);
    }
    return value;
  }

  private async write(store: DeploymentStoreFile): Promise<void> {
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

function isStoreFile(value: unknown): value is DeploymentStoreFile {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return record.schemaVersion === 1 && Array.isArray(record.deployments);
}
