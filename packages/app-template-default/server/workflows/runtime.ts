import type { DatabaseManager } from '@nocobase/database';
import type { NocoBaseQueueManager } from '@nocobase/queue';
import {
  LocalWorkflowArtifactStore,
  WorkflowPublisher,
  WorkflowRuntime,
  syncWorkflowDeployment,
  type JsonObject,
  type WorkflowArtifactStore,
  type WorkflowDefinition,
  type WorkflowEventOptions,
} from '@nocobase/workflow';
import type { FsDriveDiskConfig } from '@nocobase/drive';
import { appWorkflowInstructions } from './instructions.js';

export interface AppWorkflowRuntime { start(): Promise<void>; stop(): Promise<void>; refreshSourceResolvers(): Promise<void>; }
export interface CreateAppWorkflowRuntimeOptions { database: DatabaseManager; queue: NocoBaseQueueManager; app?: unknown; sourceRoot?: string; distRoot: string; artifactDisk: FsDriveDiskConfig; production: boolean; sourceResolverDiagnostic: boolean; warn?: (message: string) => void; }

export function getWorkflowEngine(runtime: AppWorkflowRuntime): WorkflowRuntime {
  const engine = workflowEngines.get(runtime);
  if (!engine) throw new Error('Workflow runtime was not created by createAppWorkflowRuntime().');
  return engine;
}

const workflowEngines: WeakMap<AppWorkflowRuntime, WorkflowRuntime> = new WeakMap();
const runtimeWorkflows: WeakMap<object, AppWorkflowRuntime> = new WeakMap();
const workflowStores: WeakMap<AppWorkflowRuntime, WorkflowArtifactStore> = new WeakMap();

export function bindRuntimeWorkflow(owner: object, workflow: AppWorkflowRuntime | undefined): void { if (workflow) runtimeWorkflows.set(owner, workflow); }
export async function startRuntimeWorkflow(owner: object): Promise<void> { await runtimeWorkflows.get(owner)?.start(); }
export function getRuntimeWorkflow(owner: object): AppWorkflowRuntime | undefined { return runtimeWorkflows.get(owner); }
export function getWorkflowArtifactStore(runtime: AppWorkflowRuntime): WorkflowArtifactStore | undefined { return workflowStores.get(runtime); }

export function createAppWorkflowRuntime(options: CreateAppWorkflowRuntimeOptions): AppWorkflowRuntime {
  if (options.sourceResolverDiagnostic) {
    if (options.production) throw new Error('WORKFLOW_SOURCE_RESOLVER_DIAGNOSTIC is forbidden in production');
    if (!options.sourceRoot) throw new Error('Workflow SourceDir diagnostic requires an explicit sourceRoot');
    options.warn?.('WARNING: Workflow SourceDir resolver diagnostic is enabled; Artifact execution remains the default.');
  }
  const store = new LocalWorkflowArtifactStore({ storeRoot: options.artifactDisk.location });
  const publisher = new WorkflowPublisher({ database: options.database, artifactStore: store });
  const engine = new WorkflowRuntime({ database: options.database, queue: options.queue, instructions: appWorkflowInstructions, app: options.app, artifactStore: store, ...(options.sourceResolverDiagnostic && options.sourceRoot ? { allowSourceRunModules: true, diagnosticSourceRoot: options.sourceRoot } : {}) });
  let synchronized = false;
  const runtime: AppWorkflowRuntime = {
    start: async (): Promise<void> => {
      if (!synchronized) { await syncWorkflowDeployment(options.distRoot, publisher, store); synchronized = true; }
      await engine.start();
    },
    stop: (): Promise<void> => engine.stop(),
    refreshSourceResolvers: (): Promise<void> => engine.refreshSourceResolvers(),
  };
  workflowEngines.set(runtime, engine);
  workflowStores.set(runtime, store);
  return runtime;
}

export function triggerAppWorkflow(runtime: AppWorkflowRuntime, workflow: WorkflowDefinition, context: JsonObject, options: WorkflowEventOptions): ReturnType<WorkflowRuntime['trigger']> {
  const engine = workflowEngines.get(runtime);
  if (!engine) throw new Error('Workflow runtime was not created by createAppWorkflowRuntime().');
  return engine.trigger(workflow, context, options);
}

export function isAppWorkflowRuntimeStarted(runtime: AppWorkflowRuntime): boolean { return workflowEngines.get(runtime)?.started ?? false; }
export { appWorkflowInstructions } from './instructions.js';
