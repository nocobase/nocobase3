import type { DatabaseManager } from '@nocobase/database';
import type { NocoBaseQueueManager } from '@nocobase/queue';

import type Processor from './processor.js';
import type { WorkflowInputSchema, WorkflowInputValues } from './workflow-inputs.js';

export type WorkflowId = number | string;
export type JsonObject = Record<string, unknown>;

export interface WorkflowNode {
  id: WorkflowId;
  key: string;
  title: string | null;
  workflowId: WorkflowId;
  upstreamKey: string | null;
  branchKey: string | null;
  downstreamKey: string | null;
  type: string;
  config: JsonObject;
  output: JsonObject;
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
  type: string;
  triggerTitle: string | null;
  config: JsonObject;
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
  eventKey: string;
  context: unknown;
  input: WorkflowInputValues;
  status: number | null;
  dispatched: boolean;
  parentExecutionId: WorkflowId | null;
  stack: WorkflowId[];
  output: unknown;
  startedAt: string | null;
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
  startedAt: string;
  log: string | null;
  execution?: WorkflowRun;
}

export interface WorkflowInstructionResult {
  status: number;
  result?: unknown;
  meta?: unknown;
  log?: string;
  nextKey?: string | null;
}

export type WorkflowInstructionRunner = (
  node: WorkflowNode,
  input: WorkflowNodeRun | { result: unknown } | undefined,
  processor: Processor,
  options?: { rerun?: true; signal?: AbortSignal },
) => WorkflowInstructionResult | null | void | Promise<WorkflowInstructionResult | null | void>;

export interface WorkflowInstruction {
  branching?: boolean;
  run: WorkflowInstructionRunner;
  resume?: WorkflowInstructionRunner;
  getScope?: (node: WorkflowNode, data: unknown, processor: Processor) => unknown;
  validateConfig?: (config: JsonObject) => Record<string, string> | null;
}

export interface WorkflowTrigger {
  validateEvent?: (
    workflow: WorkflowDefinition,
    context: unknown,
    options: WorkflowEventOptions,
  ) => boolean | Promise<boolean>;
  validateConfig?: (config: JsonObject) => Record<string, string> | null;
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
  parentExecutionId?: WorkflowId;
  inputValues?: WorkflowInputValues;
  onTriggerFail?: (
    workflow: WorkflowDefinition,
    context: unknown,
    options: WorkflowEventOptions,
    error?: unknown,
  ) => void | Promise<void>;
}

export interface WorkflowQueueTask {
  executionId: WorkflowId;
  nodeRunId?: WorkflowId;
  rerun?: ProcessorRerunOptions;
}

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
  instructions: Map<string, WorkflowInstruction>;
  /** Same layering as `instructions`, on top of `coreTriggers`. */
  triggers?: Map<string, WorkflowTrigger>;
  logger?: WorkflowLogger;
  environment?: Record<string, unknown> | (() => Record<string, unknown>);
  functions?: Record<string, (...args: unknown[]) => unknown>;
  /** Application value exposed to `run` scripts as `runtime.app`. */
  app?: unknown;
  /** Source packages discovered and registered before the runtime accepts work. */
  sources?: WorkflowRuntimeSourceOptions;

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
  /** Forwarded to `Dispatcher.recover()` on `start()`. */
  recoverGracePeriod?: number;
}
