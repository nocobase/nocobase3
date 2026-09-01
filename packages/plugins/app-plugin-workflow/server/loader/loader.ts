import type { DatabaseManager } from '@nocobase/db';
import type { WorkflowId } from '../engine/index.js';

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
  refreshEngine(): Promise<void>;
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
      let registered = await this.options.database
        .query()
        .selectFrom('workflows')
        .select('id')
        .where('key', '=', artifact.key)
        .where('hash', '=', artifact.digest)
        .executeTakeFirst<{ id: WorkflowId }>();
      let created = false;
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
      if (!registered) {
        const result = await this.publisher.registerArtifact(artifact);
        registered = { id: result.workflowId };
        created = result.action !== 'unchanged';
      }
      const current = await this.options.database
        .query()
        .selectFrom('workflows')
        .select('id')
        .where('key', '=', artifact.key)
        .where('current', '=', true)
        .executeTakeFirst();
      if (!current) await this.publisher.activate(registered.id);
      if (created || !stored || !current) await this.options.refreshEngine();
      return registered.id;
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
