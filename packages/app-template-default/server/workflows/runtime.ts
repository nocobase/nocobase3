import path from 'node:path';

import type { DatabaseManager } from '@nocobase/database';
import type { NocoBaseQueueManager } from '@nocobase/queue';
import {
  WorkflowRuntime,
  type WorkflowDefinition,
  type WorkflowEventOptions,
} from '@nocobase/workflow';

import { appWorkflowInstructions } from './instructions.js';
import { appWorkflowTriggers } from './triggers.js';

export interface AppWorkflowRuntime {
  start(): Promise<void>;
  stop(): Promise<void>;
  refreshSourceResolvers(): Promise<void>;
}

const workflowEngines: WeakMap<AppWorkflowRuntime, WorkflowRuntime> = new WeakMap<AppWorkflowRuntime, WorkflowRuntime>();
const runtimeWorkflows: WeakMap<object, AppWorkflowRuntime> = new WeakMap<object, AppWorkflowRuntime>();

export function bindRuntimeWorkflow(owner: object, workflow: AppWorkflowRuntime | undefined): void {
  if (workflow) {
    runtimeWorkflows.set(owner, workflow);
  }
}

export async function startRuntimeWorkflow(owner: object): Promise<void> {
  await runtimeWorkflows.get(owner)?.start();
}

export function getRuntimeWorkflow(owner: object): AppWorkflowRuntime | undefined {
  return runtimeWorkflows.get(owner);
}

export function createAppWorkflowRuntime(options: {
  database: DatabaseManager;
  queue: NocoBaseQueueManager;
  app?: unknown;
  sourceRoot?: string;
}): AppWorkflowRuntime {
  const engine = new WorkflowRuntime({
    database: options.database,
    queue: options.queue,
    instructions: appWorkflowInstructions,
    triggers: appWorkflowTriggers,
    app: options.app,
    sources: {
      rootPath: options.sourceRoot ?? path.resolve(process.cwd(), 'server/workflows'),
      autoActivate: true,
      autoEnable: true,
    },
  });
  const runtime: AppWorkflowRuntime = {
    start: (): Promise<void> => engine.start(),
    stop: (): Promise<void> => engine.stop(),
    refreshSourceResolvers: (): Promise<void> => engine.refreshSourceResolvers(),
  };
  workflowEngines.set(runtime, engine);
  return runtime;
}

export function triggerAppWorkflow(
  runtime: AppWorkflowRuntime,
  workflow: WorkflowDefinition,
  context: unknown,
  options: WorkflowEventOptions,
): ReturnType<WorkflowRuntime['trigger']> {
  const engine = workflowEngines.get(runtime);
  if (!engine) {
    throw new Error('Workflow runtime was not created by createAppWorkflowRuntime().');
  }
  return engine.trigger(workflow, context, options);
}

export function isAppWorkflowRuntimeStarted(runtime: AppWorkflowRuntime): boolean {
  return workflowEngines.get(runtime)?.started ?? false;
}

export { appWorkflowInstructions } from './instructions.js';
export { appWorkflowTriggers } from './triggers.js';
