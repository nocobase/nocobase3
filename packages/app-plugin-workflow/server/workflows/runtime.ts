import type { DatabaseManager } from '@nocobase/database';
import type { NocoBaseQueueManager } from '@nocobase/queue';
import {
  LocalWorkflowArtifactStore,
  WorkflowPublisher,
  WorkflowRuntime,
  discoverWorkflowDistArtifacts,
  type JsonObject,
  type WorkflowArtifactStore,
  type WorkflowDefinition,
  type WorkflowEventOptions,
  type WorkflowDistArtifact,
} from '../../engine/index.js';
import type { FsDriveDiskConfig } from '@nocobase/drive';
import { appWorkflowInstructions } from './instructions.js';

export interface AppWorkflowRuntime {
  start(): Promise<void>;
  stop(): Promise<void>;
  refreshSourceResolvers(): Promise<void>;
  discoverArtifacts(): Promise<readonly WorkflowDistArtifact[]>;
  publishArtifact(key: string, reason: 'enable' | 'trigger'): Promise<void>;
}
export interface CreateAppWorkflowRuntimeOptions {
  database: DatabaseManager;
  queue: NocoBaseQueueManager;
  app?: unknown;
  sourceRoot?: string;
  distRoot: string;
  artifactDisk: FsDriveDiskConfig;
  production: boolean;
  sourceResolverDiagnostic: boolean;
  instructions?: Map<
    string,
    import('../../engine/index.js').WorkflowInstructionClass
  >;
  warn?: (message: string) => void;
}

export function getWorkflowEngine(
  runtime: AppWorkflowRuntime,
): WorkflowRuntime {
  const engine = workflowEngines.get(runtime);
  if (!engine)
    throw new Error(
      'Workflow runtime was not created by createAppWorkflowRuntime().',
    );
  return engine;
}

const workflowEngines: WeakMap<AppWorkflowRuntime, WorkflowRuntime> =
  new WeakMap();
const runtimeWorkflows: WeakMap<object, AppWorkflowRuntime> = new WeakMap();
const workflowStores: WeakMap<AppWorkflowRuntime, WorkflowArtifactStore> =
  new WeakMap();

export function bindRuntimeWorkflow(
  owner: object,
  workflow: AppWorkflowRuntime | undefined,
): void {
  if (workflow) runtimeWorkflows.set(owner, workflow);
}
export async function startRuntimeWorkflow(owner: object): Promise<void> {
  await runtimeWorkflows.get(owner)?.start();
}
export function getRuntimeWorkflow(
  owner: object,
): AppWorkflowRuntime | undefined {
  return runtimeWorkflows.get(owner);
}
export function getWorkflowArtifactStore(
  runtime: AppWorkflowRuntime,
): WorkflowArtifactStore | undefined {
  return workflowStores.get(runtime);
}

export function createAppWorkflowRuntime(
  options: CreateAppWorkflowRuntimeOptions,
): AppWorkflowRuntime {
  if (options.sourceResolverDiagnostic) {
    if (options.production)
      throw new Error(
        'WORKFLOW_SOURCE_RESOLVER_DIAGNOSTIC is forbidden in production',
      );
    if (!options.sourceRoot)
      throw new Error(
        'Workflow SourceDir diagnostic requires an explicit sourceRoot',
      );
    options.warn?.(
      'WARNING: Workflow SourceDir resolver diagnostic is enabled; Artifact execution remains the default.',
    );
  }
  const store = new LocalWorkflowArtifactStore({
    storeRoot: options.artifactDisk.location,
  });
  const publisher = new WorkflowPublisher({
    database: options.database,
    artifactStore: store,
  });
  const engine = new WorkflowRuntime({
    database: options.database,
    queue: options.queue,
    instructions: options.instructions ?? appWorkflowInstructions,
    app: options.app,
    artifactStore: store,
    ...(options.sourceResolverDiagnostic && options.sourceRoot
      ? {
          allowSourceRunModules: true,
          diagnosticSourceRoot: options.sourceRoot,
        }
      : {}),
  });
  let discovered: Promise<readonly WorkflowDistArtifact[]> | undefined;
  let startPromise: Promise<void> | undefined;
  const locks = new Map<string, Promise<void>>();
  const withKeyLock = async (
    key: string,
    task: () => Promise<void>,
  ): Promise<void> => {
    const previous = locks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    locks.set(key, current);
    await previous;
    try {
      await task();
    } finally {
      release();
      if (locks.get(key) === current) locks.delete(key);
    }
  };
  const runtime: AppWorkflowRuntime = {
    start: (): Promise<void> => {
      startPromise ??= engine.start().catch((error: unknown) => {
        startPromise = undefined;
        throw error;
      });
      return startPromise;
    },
    stop: async (): Promise<void> => {
      try {
        await startPromise;
      } catch {
        // A failed start resets startPromise and leaves stop() safe to call.
      }
      await engine.stop();
    },
    refreshSourceResolvers: (): Promise<void> =>
      engine.refreshSourceResolvers(),
    discoverArtifacts: async (): Promise<readonly WorkflowDistArtifact[]> => {
      discovered ??= discoverWorkflowDistArtifacts(options.distRoot);
      return discovered;
    },
    publishArtifact: async (
      key: string,
      reason: 'enable' | 'trigger',
    ): Promise<void> => {
      await withKeyLock(key, async () => {
        const current = await options.database
          .query()
          .selectFrom('workflows')
          .select(['id', 'enabled', 'current'])
          .where('key', '=', key)
          .where('current', '=', true)
          .executeTakeFirst<Record<string, unknown>>();
        if (reason === 'trigger' && !current?.enabled) return;
        const artifacts = await runtime.discoverArtifacts();
        const artifact = artifacts.find((item) => item.key === key);
        if (!artifact) return;
        const registered = await options.database
          .query()
          .selectFrom('workflows')
          .select('id')
          .where('key', '=', key)
          .where('hash', '=', artifact.digest)
          .executeTakeFirst();
        if (registered) return;
        await store.commit(key, artifact.digest, artifact.directory);
        const result = await publisher.registerArtifact(artifact);
        await publisher.activate(result.workflowId);
        if (reason === 'enable')
          await options.database
            .query()
            .updateTable('workflows')
            .set({ enabled: true })
            .where('id', '=', result.workflowId)
            .execute();
        await engine.refreshSourceResolvers();
      });
    },
  };
  workflowEngines.set(runtime, engine);
  workflowStores.set(runtime, store);
  return runtime;
}

export function triggerAppWorkflow(
  runtime: AppWorkflowRuntime,
  workflow: WorkflowDefinition,
  context: JsonObject,
  options: WorkflowEventOptions,
): ReturnType<WorkflowRuntime['trigger']> {
  const engine = workflowEngines.get(runtime);
  if (!engine)
    throw new Error(
      'Workflow runtime was not created by createAppWorkflowRuntime().',
    );
  return engine.trigger(workflow, context, options);
}

export function isAppWorkflowRuntimeStarted(
  runtime: AppWorkflowRuntime,
): boolean {
  return workflowEngines.get(runtime)?.started ?? false;
}
export { appWorkflowInstructions } from './instructions.js';
