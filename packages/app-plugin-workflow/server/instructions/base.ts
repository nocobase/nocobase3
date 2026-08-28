import type Processor from '../engine/processor.js';
import type {
  JsonObject,
  WorkflowNode,
  WorkflowNodeRun,
} from '../engine/types.js';
import type {
  ConfigIssue,
  NodeExpression,
  NodeResultSchema,
  WorkflowNodeSourceInput,
} from './types.js';

export interface WorkflowInstructionResult {
  status: number;
  result?: unknown;
  error?: string;
  meta?: unknown;
  log?: string;
  nextKey?: string | null;
}

export interface WorkflowInstructionContext<
  TConfig extends JsonObject = JsonObject,
> {
  readonly node: WorkflowNode<TConfig>;
  readonly nodeRun: WorkflowNodeRun;
  readonly processor: Processor;
  readonly input: WorkflowNodeRun | { result: unknown } | undefined;
  readonly signal: AbortSignal;
}

export abstract class WorkflowInstruction<
  TConfig extends JsonObject = JsonObject,
> {
  readonly node: WorkflowNode<TConfig>;
  readonly nodeRun: WorkflowNodeRun;
  readonly processor: Processor;
  readonly input: WorkflowNodeRun | { result: unknown } | undefined;
  readonly signal: AbortSignal;

  constructor(context: WorkflowInstructionContext<TConfig>) {
    this.node = context.node;
    this.nodeRun = context.nodeRun;
    this.processor = context.processor;
    this.input = context.input;
    this.signal = context.signal;
  }

  get config(): TConfig {
    return this.node.config;
  }

  abstract run(): Promise<WorkflowInstructionResult | null | void>;
  resume?(): Promise<WorkflowInstructionResult | null | void>;
}

export interface WorkflowInstructionClass<
  TConfig extends JsonObject = JsonObject,
  TBranch extends string = string,
> {
  readonly type: string;
  readonly branches:
    readonly TBranch[] | null | ((config: JsonObject) => readonly string[]);
  readonly result?: NodeResultSchema | null;
  create(source: WorkflowNodeSourceInput<TConfig>): NodeExpression<TBranch>;
  validateConfig(config: unknown): ConfigIssue[];
  new (
    context: WorkflowInstructionContext<TConfig>,
  ): WorkflowInstruction<TConfig>;
}
