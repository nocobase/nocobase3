import path from 'node:path';
import { createRequire } from 'node:module';
import type {
  WorkflowRunModule,
  WorkflowRunModuleRequest,
  WorkflowRunModuleResolver,
  WorkflowRunFunction,
} from './instructions/run.js';
import type { WorkflowArtifactStore } from './artifact-store.js';

export interface ArtifactResolverOptions {
  store: WorkflowArtifactStore;
}
export class WorkflowArtifactResolverError extends Error {}

const metadata: WeakMap<object, { artifactDigest: string; script: string }> =
  new WeakMap();
const requireArtifact: NodeJS.Require = createRequire(import.meta.url);
export function getWorkflowRunArtifactMetadata(
  module: WorkflowRunModule,
): { artifactDigest: string; script: string } | undefined {
  return metadata.get(module.run);
}

export class ArtifactResolver implements WorkflowRunModuleResolver {
  private readonly cache: Map<string, Promise<WorkflowRunModule>> = new Map();
  constructor(private readonly options: ArtifactResolverOptions) {}
  resolve(request: WorkflowRunModuleRequest): Promise<WorkflowRunModule> {
    if (!request.hash)
      return Promise.reject(
        new WorkflowArtifactResolverError(
          `Run node "${request.nodeKey}" has no artifact digest`,
        ),
      );
    if (
      !request.sourcePath.startsWith('./') ||
      request.sourcePath.includes('..') ||
      path.isAbsolute(request.sourcePath) ||
      /^(?:[a-z]+:|\/\/)/i.test(request.sourcePath)
    )
      return Promise.reject(
        new WorkflowArtifactResolverError(
          `Run script "${request.sourcePath}" is unsafe`,
        ),
      );
    const normalizedSourcePath = request.sourcePath
      .slice(2)
      .replaceAll('\\', '/');
    const key = `${request.workflowKey}\0${request.hash}\0${normalizedSourcePath}`;
    const existing = this.cache.get(key);
    if (existing) return existing;
    const pending = this.load(request, normalizedSourcePath);
    this.cache.set(key, pending);
    return pending;
  }
  private async load(
    request: WorkflowRunModuleRequest,
    normalizedSourcePath: string,
  ): Promise<WorkflowRunModule> {
    const digest = request.hash;
    if (!digest)
      throw new WorkflowArtifactResolverError(
        `Run node "${request.nodeKey}" has no artifact digest`,
      );
    const workflow = await this.options.store.readWorkflow(
      request.workflowKey,
      digest,
    );
    const output = workflow.server?.run?.[normalizedSourcePath];
    if (!output)
      throw new WorkflowArtifactResolverError(
        `Run script "${request.sourcePath}" is not present in Artifact ${request.workflowKey}/${digest}`,
      );
    const directory = await this.options.store.materialize(
      request.workflowKey,
      digest,
    );
    const loaded = requireArtifact(path.join(directory, output)) as Record<
      string,
      unknown
    >;
    if (typeof loaded.run !== 'function')
      throw new WorkflowArtifactResolverError(
        `Run script "${request.sourcePath}" must export a function named run`,
      );
    const run = loaded.run as WorkflowRunFunction;
    const module: WorkflowRunModule = { run };
    metadata.set(run, { artifactDigest: digest, script: request.sourcePath });
    return module;
  }
}
