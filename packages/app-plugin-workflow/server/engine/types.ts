import type { DatabaseManager } from '@nocobase/database';
import type { NocoBaseQueueManager } from '@nocobase/queue';

import type { WorkflowInputSchema, WorkflowInputValues } from './inputs.js';
import type { ContextSchema } from './invocation.js';
import type { WorkflowArtifactStore } from '../loader/artifact-store.js';
import type { WorkflowNodeOptions } from '../instructions/types.js';
import type { WorkflowInstructionClass } from '../instructions/base.js';
export {
  WorkflowInstruction,
  type WorkflowInstructionClass,
  type WorkflowInstructionContext,
  type WorkflowInstructionResult,
} from '../instructions/base.js';

export type WorkflowId = number | string;
export type JsonPrimitive = null | boolean | number | string;
export type JsonValue = JsonPrimitive | JsonValue[] | JsonObject;
export interface JsonObject {
  [key: string]: JsonValue;
}

export interface WorkflowNode<TConfig extends JsonObject = JsonObject> {
  id: WorkflowId;
  key: string;
  title: string | null;
  description: string | null;
  workflowId: WorkflowId;
  upstreamKey: string | null;
  branchKey: string | null;
  downstreamKey: string | null;
  type: string;
  config: TConfig;
  options: WorkflowNodeOptions;
  upstream?: WorkflowNode;
  downstream?: WorkflowNode;
}

export interface WorkflowDefinition {
  id: WorkflowId;
  key: string;
  hash: string | null;
  version: string | null;
  title: string | null;
  enabled: boolean;
  description: string | null;
  contextSchema: ContextSchema;
  inputSchema: WorkflowInputSchema;
  inputValues: WorkflowInputValues;
  current: boolean | null;
  options: JsonObject;
  nodes: WorkflowNode[];
}

export interface WorkflowRun {
  id: WorkflowId;
  workflowId: WorkflowId;
  workflowKey: string;
  hash: string | null;
  eventKey: string;
  context: JsonObject;
  input: WorkflowInputValues;
  status: number | null;
  dispatched: boolean;
  parentRunId: WorkflowId | null;
  stack: WorkflowId[];
  output: unknown;
  startedAt: string | null;
  finishedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  manually: boolean;
  reason: string | null;
  workflow?: WorkflowDefinition;
  nodeRuns?: WorkflowNodeRun[];
}

export interface WorkflowNodeRun {
  id: WorkflowId;
  workflowRunId: WorkflowId;
  nodeId: WorkflowId;
  nodeKey: string;
  status: number;
  meta: unknown;
  result: unknown;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
  expiresAt: string | null;
  log: string | null;
  execution?: WorkflowRun;
}

export interface WorkflowLogger {
  debug(message: string, details?: unknown): void;
  info(message: string, details?: unknown): void;
  warn(message: string, details?: unknown): void;
  error(message: string, details?: unknown): void;
}

export interface WorkflowEventOptions {
  eventKey?: string;
  deferred?: boolean;
  /** Execute any workflow manually, bypassing its enabled state and trigger-specific event validation. */
  manually?: boolean;
  force?: boolean;
  stack?: WorkflowId[];
  parentRunId?: WorkflowId;
  inputValues?: WorkflowInputValues;
  onTriggerFail?: (
    workflow: WorkflowDefinition,
    context: unknown,
    options: WorkflowEventOptions,
    error?: unknown,
  ) => void | Promise<void>;
}

export interface WorkflowExecutionQueueTask {
  executionId: WorkflowId;
  nodeRunId?: WorkflowId;
  rerun?: ProcessorRerunOptions;
}

export type WorkflowQueueTask = WorkflowExecutionQueueTask;

export interface WorkflowQueue {
  publish(task: WorkflowQueueTask): Promise<void>;
}

export interface ProcessorRerunOptions {
  nodeKey?: string;
  nodeId?: WorkflowId;
  overwrite?: boolean;
}

export interface WorkflowRuntimeSourceOptions {
  /** Directory containing one `<workflow-key>/workflow.ts` package per workflow. */
  rootPath: string;
  /** Make newly materialized revisions current immediately. */
  autoActivate?: boolean;
  /** Enable current source revisions after registration. */
  autoEnable?: boolean;
}

export interface WorkflowRuntimeOptions {
  database: DatabaseManager;
  connectionName?: string;
  /**
   * Instructions contributed by the application.
   *
   * `WorkflowRuntime` layers this map on top of `coreInstructions`, so an entry
   * here adds a node type or replaces a core one under the same key.
   */
  instructions: Map<string, WorkflowInstructionClass>;
  logger?: WorkflowLogger;
  environment?: Record<string, unknown> | (() => Record<string, unknown>);
  functions?: Record<string, (...args: unknown[]) => unknown>;
  /** Application value exposed to `run` scripts as `runtime.app`. */
  app?: unknown;
  /** Source packages discovered and registered before the runtime accepts work. */
  sources?: WorkflowRuntimeSourceOptions;
  /** Immutable production artifacts. When present, run nodes never read source directories. */
  artifactStore?: WorkflowArtifactStore;
  /** Explicit development-only opt-in for executing package source. Default false. */
  allowSourceRunModules?: boolean;
  /** Source root used only by the explicit execution diagnostic; it is never scanned or published. */
  diagnosticSourceRoot?: string;

  // --- T5: fields the assembly layer needs. All optional, so the meaning of
  // every field declared before this point is unchanged. ---

  /**
   * Queue manager tasks are published to. Without it the runtime dispatches
   * in-process (`Dispatcher.enqueue()` falls through to `dispatch()`), which is
   * useful for a single-process test or an application without a queue manager.
   */
  queue?: NocoBaseQueueManager;
  /** Queue name to publish on and to consume from, default `WORKFLOW_QUEUE_NAME`. */
  queueName?: string;
  /** `false` keeps the reaper from being created at all; default is enabled. */
  timeoutReaper?: boolean;
  /** Forwarded to `createTimeoutReaper()`. */
  timeoutReaperIntervalMs?: number;
  /** Forwarded to `createTimeoutReaper()`. */
  timeoutReaperBatchSize?: number;
  /** Forwarded to `Dispatcher.recover()` during initialization. */
  recoverGracePeriod?: number;
}
