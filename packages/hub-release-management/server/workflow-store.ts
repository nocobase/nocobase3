import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import type {
  DeploymentKind,
  ReleaseActor,
  ReleaseApprovalRecord,
  ReleaseNotificationRecord,
} from './types.js';

export interface ReleaseWorkflowStore {
  listApprovals(appId?: string): Promise<ReleaseApprovalRecord[]>;
  findApprovalById(id: string): Promise<ReleaseApprovalRecord | null>;
  findApprovalByIdempotencyKey(
    appId: string,
    kind: DeploymentKind,
    idempotencyKey: string,
  ): Promise<ReleaseApprovalRecord | null>;
  saveApproval(record: ReleaseApprovalRecord): Promise<void>;
  listNotifications(appId?: string): Promise<ReleaseNotificationRecord[]>;
  saveNotification(record: ReleaseNotificationRecord): Promise<void>;
}

interface WorkflowStoreFile {
  schemaVersion: 1;
  approvals: ReleaseApprovalRecord[];
  notifications: ReleaseNotificationRecord[];
}

export class JsonReleaseWorkflowStore implements ReleaseWorkflowStore {
  private lock: Promise<unknown> = Promise.resolve();

  constructor(readonly filePath: string) {}

  async listApprovals(appId?: string): Promise<ReleaseApprovalRecord[]> {
    return this.withLock(async () => {
      const store = await this.read();
      return store.approvals
        .filter((record) => !appId || record.appId === appId)
        .sort((left, right) =>
          right.requestedAt.localeCompare(left.requestedAt),
        )
        .map((record) => structuredClone(record));
    });
  }

  async findApprovalById(id: string): Promise<ReleaseApprovalRecord | null> {
    return this.withLock(async () => {
      const store = await this.read();
      const record = store.approvals.find((candidate) => candidate.id === id);
      return record ? structuredClone(record) : null;
    });
  }

  async findApprovalByIdempotencyKey(
    appId: string,
    kind: DeploymentKind,
    idempotencyKey: string,
  ): Promise<ReleaseApprovalRecord | null> {
    return this.withLock(async () => {
      const store = await this.read();
      const record = store.approvals.find(
        (candidate) =>
          candidate.appId === appId &&
          candidate.kind === kind &&
          candidate.idempotencyKey === idempotencyKey,
      );
      return record ? structuredClone(record) : null;
    });
  }

  async saveApproval(record: ReleaseApprovalRecord): Promise<void> {
    await this.withLock(async () => {
      const store = await this.read();
      const index = store.approvals.findIndex(
        (candidate) => candidate.id === record.id,
      );
      if (index >= 0) {
        store.approvals[index] = structuredClone(record);
      } else {
        store.approvals.push(structuredClone(record));
      }
      await this.write(store);
    });
  }

  async listNotifications(
    appId?: string,
  ): Promise<ReleaseNotificationRecord[]> {
    return this.withLock(async () => {
      const store = await this.read();
      return store.notifications
        .filter((record) => !appId || record.appId === appId)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .map((record) => structuredClone(record));
    });
  }

  async saveNotification(record: ReleaseNotificationRecord): Promise<void> {
    await this.withLock(async () => {
      const store = await this.read();
      const exists = store.notifications.some(
        (candidate) => candidate.id === record.id,
      );
      if (!exists) {
        store.notifications.push(structuredClone(record));
        await this.write(store);
      }
    });
  }

  private async read(): Promise<WorkflowStoreFile> {
    let content: string;
    try {
      content = await readFile(this.filePath, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return emptyWorkflowStore();
      }
      throw error;
    }

    const value = JSON.parse(content) as unknown;
    if (!isWorkflowStoreFile(value)) {
      throw new Error(`Invalid release workflow store at ${this.filePath}`);
    }
    return value;
  }

  private async write(store: WorkflowStoreFile): Promise<void> {
    const directory = path.dirname(this.filePath);
    await mkdir(directory, { recursive: true });
    const temporaryPath = path.join(
      directory,
      `.${path.basename(this.filePath)}.${randomUUID()}.tmp`,
    );
    await writeFile(temporaryPath, `${JSON.stringify(store, null, 2)}\n`, {
      encoding: 'utf8',
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

export class InMemoryReleaseWorkflowStore implements ReleaseWorkflowStore {
  private readonly approvals: ReleaseApprovalRecord[] = [];
  private readonly notifications: ReleaseNotificationRecord[] = [];

  async listApprovals(appId?: string): Promise<ReleaseApprovalRecord[]> {
    return this.approvals
      .filter((record) => !appId || record.appId === appId)
      .map((record) => structuredClone(record));
  }

  async findApprovalById(id: string): Promise<ReleaseApprovalRecord | null> {
    const record = this.approvals.find((candidate) => candidate.id === id);
    return record ? structuredClone(record) : null;
  }

  async findApprovalByIdempotencyKey(
    appId: string,
    kind: DeploymentKind,
    idempotencyKey: string,
  ): Promise<ReleaseApprovalRecord | null> {
    const record = this.approvals.find(
      (candidate) =>
        candidate.appId === appId &&
        candidate.kind === kind &&
        candidate.idempotencyKey === idempotencyKey,
    );
    return record ? structuredClone(record) : null;
  }

  async saveApproval(record: ReleaseApprovalRecord): Promise<void> {
    const index = this.approvals.findIndex(
      (candidate) => candidate.id === record.id,
    );
    if (index >= 0) this.approvals[index] = structuredClone(record);
    else this.approvals.push(structuredClone(record));
  }

  async listNotifications(
    appId?: string,
  ): Promise<ReleaseNotificationRecord[]> {
    return this.notifications
      .filter((record) => !appId || record.appId === appId)
      .map((record) => structuredClone(record));
  }

  async saveNotification(record: ReleaseNotificationRecord): Promise<void> {
    const exists = this.notifications.some(
      (candidate) => candidate.id === record.id,
    );
    if (!exists) this.notifications.push(structuredClone(record));
  }
}

export interface ReleaseNotificationInput {
  approvalId: string;
  appId: string;
  releaseId: string;
  event: ReleaseNotificationRecord['event'];
  recipient: ReleaseActor;
  title: string;
  body: string;
}

export interface ReleaseNotificationSink {
  notify(input: ReleaseNotificationInput): Promise<ReleaseNotificationRecord>;
}

export class StoreReleaseNotificationSink implements ReleaseNotificationSink {
  constructor(private readonly store: ReleaseWorkflowStore) {}

  async notify(
    input: ReleaseNotificationInput,
  ): Promise<ReleaseNotificationRecord> {
    const record: ReleaseNotificationRecord = {
      id: `${input.approvalId}:${input.event}`,
      ...input,
      status: 'delivered',
      createdAt: new Date().toISOString(),
    };
    await this.store.saveNotification(record);
    return record;
  }
}

function emptyWorkflowStore(): WorkflowStoreFile {
  return { schemaVersion: 1, approvals: [], notifications: [] };
}

function isWorkflowStoreFile(value: unknown): value is WorkflowStoreFile {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    record.schemaVersion === 1 &&
    Array.isArray(record.approvals) &&
    Array.isArray(record.notifications)
  );
}
