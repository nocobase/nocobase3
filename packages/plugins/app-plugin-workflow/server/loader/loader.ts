import type { DatabaseManager } from '@nocobase/db';
import { asId, type WorkflowId } from '../engine/index.js';

import { workflowStore, type WorkflowStore } from '../collections/store.js';

import type { WorkflowArtifactStore } from './artifact-store.js';
import {
  discoverWorkflowDistArtifacts,
  WorkflowPublisher,
  type WorkflowDistArtifact,
} from './synchronizer.js';

export interface WorkflowLoaderOptions {
  database: DatabaseManager;
  artifactStore: WorkflowArtifactStore;
  distRoot: string;
}

export class WorkflowLoader {
  private readonly publisher: WorkflowPublisher;
  private readonly locks = new Map<string, Promise<void>>();
  private discovered?: Promise<readonly WorkflowDistArtifact[]>;

  constructor(private readonly options: WorkflowLoaderOptions) {
    this.publisher = new WorkflowPublisher({
      database: options.database,
      artifactStore: options.artifactStore,
    });
  }

  private get store(): WorkflowStore {
    return workflowStore(this.options.database);
  }

  discover(): Promise<readonly WorkflowDistArtifact[]> {
    this.discovered ??= discoverWorkflowDistArtifacts(this.options.distRoot);
    return this.discovered;
  }

  async ensureMaterialized(digest: string): Promise<WorkflowId | undefined> {
    const artifact = (await this.discover()).find(
      (item) => item.digest === digest,
    );
    if (!artifact) return undefined;
    return this.withKeyLock(artifact.key, async () => {
      const store = this.store;
      const found = await store.workflows.findOne({
        filter: { key: artifact.key, hash: artifact.digest },
        select: (select) => select.fields('id'),
      });
      let registered: WorkflowId | undefined = found
        ? asId(found.id)
        : undefined;
      const stored = await this.options.artifactStore.has(
        artifact.key,
        artifact.digest,
      );
      if (!stored)
        await this.options.artifactStore.commit(
          artifact.key,
          artifact.digest,
          artifact.directory,
        );
      if (registered === undefined) {
        const result = await this.publisher.registerArtifact(artifact);
        registered = result.workflowId;
      }
      const current = await store.workflows.findOne({
        filter: { key: artifact.key, current: true },
        select: (select) => select.fields('id'),
      });
      if (!current) await this.publisher.activate(registered);
      return registered;
    });
  }

  private async withKeyLock<T>(
    key: string,
    task: () => Promise<T>,
  ): Promise<T> {
    const previous = this.locks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.locks.set(key, current);
    await previous;
    try {
      return await task();
    } finally {
      release();
      if (this.locks.get(key) === current) this.locks.delete(key);
    }
  }
}
