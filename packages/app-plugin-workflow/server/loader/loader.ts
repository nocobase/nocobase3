import type { DatabaseManager } from '@nocobase/app-database';

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

  async sync(key: string, reason: 'enable' | 'trigger'): Promise<void> {
    await this.withKeyLock(key, async () => {
      const current = await this.options.database
        .query()
        .selectFrom('workflows')
        .select(['id', 'enabled', 'current'])
        .where('key', '=', key)
        .where('current', '=', true)
        .executeTakeFirst<Record<string, unknown>>();
      if (reason === 'trigger' && !current?.enabled) return;
      const artifact = (await this.discover()).find((item) => item.key === key);
      if (!artifact) return;
      const registered = await this.options.database
        .query()
        .selectFrom('workflows')
        .select('id')
        .where('key', '=', key)
        .where('hash', '=', artifact.digest)
        .executeTakeFirst();
      if (registered) return;
      await this.options.artifactStore.commit(
        key,
        artifact.digest,
        artifact.directory,
      );
      const result = await this.publisher.registerArtifact(artifact);
      await this.publisher.activate(result.workflowId);
      if (reason === 'enable') {
        await this.options.database
          .query()
          .updateTable('workflows')
          .set({ enabled: true, current: true })
          .where('key', '=', key)
          .where('current', '=', true)
          .where('id', '=', result.workflowId)
          .execute();
      }
      await this.options.refreshEngine();
    });
  }

  private async withKeyLock(
    key: string,
    task: () => Promise<void>,
  ): Promise<void> {
    const previous = this.locks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.locks.set(key, current);
    await previous;
    try {
      await task();
    } finally {
      release();
      if (this.locks.get(key) === current) this.locks.delete(key);
    }
  }
}
