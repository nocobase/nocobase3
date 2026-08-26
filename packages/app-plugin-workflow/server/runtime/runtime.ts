import type { DatabaseManager } from '@nocobase/database';
import type { NocoBaseQueueManager } from '@nocobase/queue';
import { randomUUID } from 'node:crypto';
import {
  LocalWorkflowArtifactStore,
  WorkflowLoader,
  type WorkflowDistArtifact,
} from '../loader/index.js';
import {
  WorkflowRuntime,
  assertContextSize,
  loadRun,
  loadWorkflow,
  type JsonObject,
  type WorkflowDefinition,
  type WorkflowEventOptions,
  type WorkflowInstructionClass,
  WorkflowInvocationError,
  type WorkflowTriggerReceipt,
  validateContextValue,
} from '../engine/index.js';
import type { FsDriveDiskConfig } from '@nocobase/drive';
import { appWorkflowInstructions } from './instructions.js';
import { WORKFLOW_COLLECTIONS } from '../collections/names.js';

export interface AppWorkflowRuntime {
  trigger(
    workflowKey: string,
    context: JsonObject,
    options?: WorkflowEventOptions,
  ): Promise<WorkflowTriggerReceipt>;
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
  instructions?: Map<string, WorkflowInstructionClass>;
  warn?: (message: string) => void;
}

export function triggerWorkflowDefinition(
  runtime: AppWorkflowRuntime,
  workflow: WorkflowDefinition,
  context: JsonObject,
  options: WorkflowEventOptions = {},
): ReturnType<WorkflowRuntime['trigger']> {
  const engine = workflowEngines.get(runtime);
  if (!engine)
    throw new Error(
      'Workflow runtime was not created by createAppWorkflowRuntime().',
    );
  return ensureAppWorkflowRuntimeInitialized(runtime, engine).then(() =>
    engine.trigger(workflow, context, options),
  );
}

const workflowEngines: WeakMap<AppWorkflowRuntime, WorkflowRuntime> =
  new WeakMap();
const workflowInitializationPromises = new WeakMap<
  AppWorkflowRuntime,
  Promise<void>
>();
const runtimeWorkflows: WeakMap<object, AppWorkflowRuntime> = new WeakMap();

function ensureAppWorkflowRuntimeInitialized(
  runtime: AppWorkflowRuntime,
  engine: WorkflowRuntime,
): Promise<void> {
  const existing = workflowInitializationPromises.get(runtime);
  if (existing) return existing;
  const initialization = engine.initialize().catch((error: unknown) => {
    workflowInitializationPromises.delete(runtime);
    throw error;
  });
  workflowInitializationPromises.set(runtime, initialization);
  return initialization;
}

/** Package-internal lifecycle cleanup; not exported from the server entry point. */
export async function disposeAppWorkflowRuntime(
  runtime: AppWorkflowRuntime,
): Promise<void> {
  const engine = workflowEngines.get(runtime);
  if (!engine) return;
  try {
    await workflowInitializationPromises.get(runtime);
  } catch {
    // A failed lazy initialization still leaves engine.dispose() safe to call.
  }
  workflowInitializationPromises.delete(runtime);
  await engine.dispose();
}

export function bindRuntimeWorkflow(
  owner: object,
  workflow: AppWorkflowRuntime | undefined,
): void {
  if (workflow) runtimeWorkflows.set(owner, workflow);
}
export function getRuntimeWorkflow(
  owner: object,
): AppWorkflowRuntime | undefined {
  return runtimeWorkflows.get(owner);
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
  const loader = new WorkflowLoader({
    database: options.database,
    artifactStore: store,
    distRoot: options.distRoot,
    refreshRuntime: (): Promise<void> => engine.refreshSourceResolvers(),
  });
  const runtime: AppWorkflowRuntime = {
    trigger: async (
      workflowKey: string,
      context: JsonObject,
      triggerOptions: WorkflowEventOptions = {},
    ): Promise<WorkflowTriggerReceipt> => {
      let row = await options.database
        .query()
        .selectFrom(WORKFLOW_COLLECTIONS.workflows)
        .select(['id', 'enabled', 'hash'])
        .where('key', '=', workflowKey)
        .where('current', '=', true)
        .executeTakeFirst();
      if (!row) return { status: 'skipped', reason: 'not-found' };
      if (!triggerOptions.force && !triggerOptions.manually && !row.enabled)
        return { status: 'skipped', reason: 'disabled' };

      await loader.sync(workflowKey, 'trigger');
      row = await options.database
        .query()
        .selectFrom(WORKFLOW_COLLECTIONS.workflows)
        .select(['id', 'enabled', 'hash'])
        .where('key', '=', workflowKey)
        .where('current', '=', true)
        .executeTakeFirst();
      if (!row) return { status: 'skipped', reason: 'not-found' };
      if (!triggerOptions.force && !triggerOptions.manually && !row.enabled)
        return { status: 'skipped', reason: 'disabled' };

      const hash = typeof row.hash === 'string' ? row.hash : null;
      if (!hash || !(await store.has(workflowKey, hash)))
        throw new Error(
          `Workflow Artifact ${workflowKey}/${String(hash)} is missing`,
        );
      const workflow = await loadWorkflow(
        options.database.query(),
        row.id as string | number,
      );
      if (!workflow)
        throw new WorkflowInvocationError(
          'WORKFLOW_NOT_FOUND',
          `Workflow "${workflowKey}" was not found`,
        );

      assertContextSize(context);
      const validation = validateContextValue(workflow.contextSchema, context);
      if (!validation.valid)
        throw new WorkflowInvocationError(
          'INVALID_CONTEXT',
          `Workflow "${workflowKey}" context is invalid`,
          validation.issues,
        );

      let stack = triggerOptions.stack ? [...triggerOptions.stack] : undefined;
      if (stack === undefined && triggerOptions.parentRunId !== undefined) {
        const parent = await loadRun(
          options.database.query(),
          triggerOptions.parentRunId,
        );
        if (!parent)
          throw new WorkflowInvocationError(
            'PARENT_RUN_NOT_FOUND',
            `Parent run "${String(triggerOptions.parentRunId)}" was not found`,
          );
        stack = [...parent.stack, parent.id];
      }
      if (stack?.length) {
        const repeats = await options.database
          .query()
          .selectFrom(WORKFLOW_COLLECTIONS.runs)
          .select(({ fn }) => [fn.countAll().as('count')])
          .where('workflowId', '=', workflow.id)
          .where('id', 'in', stack)
          .executeTakeFirst<{ count: number | string }>();
        const limit = Number(workflow.options.stackLimit ?? 1);
        if (Number(repeats?.count ?? 0) >= limit)
          throw new WorkflowInvocationError(
            'STACK_LIMIT_EXCEEDED',
            `Workflow "${workflow.key}" stack limit ${limit} was exceeded`,
          );
      }

      await ensureAppWorkflowRuntimeInitialized(runtime, engine);
      const eventKey = triggerOptions.eventKey ?? randomUUID();
      await engine.trigger(workflow, context, {
        ...triggerOptions,
        eventKey,
        ...(triggerOptions.parentRunId === undefined
          ? {}
          : { parentRunId: triggerOptions.parentRunId }),
        ...(stack === undefined ? {} : { stack }),
      });
      return { status: 'accepted', eventKey };
    },
    refreshSourceResolvers: (): Promise<void> =>
      engine.refreshSourceResolvers(),
    discoverArtifacts: (): Promise<readonly WorkflowDistArtifact[]> =>
      loader.discover(),
    publishArtifact: async (
      key: string,
      reason: 'enable' | 'trigger',
    ): Promise<void> => {
      await loader.sync(key, reason);
    },
  };
  workflowEngines.set(runtime, engine);
  return runtime;
}

export { appWorkflowInstructions } from './instructions.js';
