import type { DatabaseManager } from '@nocobase/db';
import type { WorkflowId, WorkflowInstructionClass } from '../engine/index.js';

import type { WorkflowArtifactStore } from './artifact-store.js';
import {
  discoverWorkflowDistArtifacts,
  WorkflowPublisher,
  type WorkflowDistArtifact,
} from './synchronizer.js';

/**
 * Development-only discovery of workflow packages from their source tree.
 *
 * Providing this makes the loader read `server/workflows` directly instead of
 * the built Artifacts under `dist/server/workflows`, so an edited `workflow.ts`
 * is visible without running `nocobase workflow build` first. The compilation
 * itself lives behind the build boundary and is reached by dynamic import, so
 * a production runtime never loads it.
 */
export interface WorkflowSourceDiscoveryOptions {
  root: string;
  /**
   * The instruction set to validate against, read at discovery time.
   *
   * A function rather than a map because plugins may register instructions
   * after the loader is constructed, and development discovery should see the
   * same contracts the engine will execute with.
   */
  instructions: () => ReadonlyMap<string, WorkflowInstructionClass>;
}

export interface WorkflowLoaderOptions {
  database: DatabaseManager;
  artifactStore: WorkflowArtifactStore;
  distRoot: string;
  source?: WorkflowSourceDiscoveryOptions;
}

export class WorkflowLoader {
  private readonly publisher: WorkflowPublisher;
  private readonly locks = new Map<string, Promise<void>>();
  private discovered?: Promise<readonly WorkflowDistArtifact[]>;
  private sourceCache?: {
    signature: string;
    artifacts: readonly WorkflowDistArtifact[];
  };

  constructor(private readonly options: WorkflowLoaderOptions) {
    this.publisher = new WorkflowPublisher({
      database: options.database,
      artifactStore: options.artifactStore,
    });
  }

  discover(): Promise<readonly WorkflowDistArtifact[]> {
    const source = this.options.source;
    if (source) return this.discoverDevelopment(source);
    return this.discoverDist();
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
      // A definition compiled from source has no Artifact to commit: the engine
      // resolves its run modules from the source package through
      // `developmentResourceRoot`, so copying the package into the Artifact
      // store would only produce a second copy that nothing reads.
      if (artifact.origin !== 'source') {
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
      }
      if (!registered) {
        const result = await this.publisher.registerArtifact(artifact);
        registered = { id: result.workflowId };
      }
      const current = await this.options.database
        .query()
        .selectFrom('workflows')
        .select('id')
        .where('key', '=', artifact.key)
        .where('current', '=', true)
        .executeTakeFirst();
      if (!current) await this.publisher.activate(registered.id);
      return registered.id;
    });
  }

  private discoverDist(): Promise<readonly WorkflowDistArtifact[]> {
    // Built Artifacts are content-addressed and immutable for the life of the
    // process, so one scan is enough.
    this.discovered ??= discoverWorkflowDistArtifacts(this.options.distRoot);
    return this.discovered;
  }

  /**
   * Source wins over a built Artifact for the same key, and a key that exists
   * only under `dist` is still offered, so a tree left behind by an earlier
   * `nocobase workflow build` keeps working.
   */
  private async discoverDevelopment(
    source: WorkflowSourceDiscoveryOptions,
  ): Promise<readonly WorkflowDistArtifact[]> {
    const byKey = new Map<string, WorkflowDistArtifact>();
    for (const artifact of await this.discoverDistLeniently())
      byKey.set(artifact.key, artifact);
    for (const artifact of await this.discoverSource(source))
      byKey.set(artifact.key, artifact);
    return [...byKey.values()].sort((left, right) =>
      left.key.localeCompare(right.key),
    );
  }

  /**
   * In development the source tree is the truth, so a stale or half-written
   * `dist/server/workflows` must not be able to stop the server from seeing it.
   */
  private async discoverDistLeniently(): Promise<
    readonly WorkflowDistArtifact[]
  > {
    try {
      return await this.discoverDist();
    } catch {
      this.discovered = Promise.resolve([]);
      return [];
    }
  }

  private async discoverSource(
    source: WorkflowSourceDiscoveryOptions,
  ): Promise<readonly WorkflowDistArtifact[]> {
    const { loadWorkflowSourcePackages, workflowSourceSignature } =
      await import('../../build/dev-source.js');
    const signature = await workflowSourceSignature(source.root);
    if (this.sourceCache?.signature === signature)
      return this.sourceCache.artifacts;
    const artifacts = (
      await loadWorkflowSourcePackages(source.root, {
        instructions: source.instructions(),
      })
    ).map((workflowPackage) => ({
      ...workflowPackage,
      origin: 'source' as const,
    }));
    this.sourceCache = { signature, artifacts };
    return artifacts;
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
