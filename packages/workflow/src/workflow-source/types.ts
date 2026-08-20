export type JsonPrimitive = null | boolean | number | string;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export interface WorkflowInputOption {
  label: string;
  value: string | number;
}

export interface WorkflowInputDeclaration {
  type: 'string' | 'number' | 'boolean';
  title?: string;
  description?: string;
  default?: string | number | boolean;
  enum?: WorkflowInputOption[];
}

export type WorkflowInputSchema = Record<string, WorkflowInputDeclaration>;

export interface ConfigIssue {
  path: string;
  message: string;
}

export interface JSONSchema {
  readonly [key: string]: JsonValue;
}

export interface NodeFactorySpec<TType extends string, TConfig, TBranch extends string = never> {
  readonly type: TType;
  readonly branches: readonly TBranch[] | null | ((config: TConfig) => readonly string[]);
  readonly validateConfig: (config: unknown) => ConfigIssue[];
  readonly configSchema?: JSONSchema;
}

export interface TriggerFactorySpec<TType extends string, _TConfig> {
  readonly type: TType;
  readonly validateConfig: (config: unknown) => ConfigIssue[];
  readonly configSchema?: JSONSchema;
}

export interface NodeSourceInput<TConfig> {
  key: string;
  title?: string;
  config: TConfig;
}

export interface TriggerSourceInput<TConfig> {
  title?: string;
  config: TConfig;
}

export interface BaseNodeExpression {
  readonly key: string;
  readonly title?: string;
  readonly type: string;
  readonly config: unknown;
}

export interface BranchingNodeExpression<TBranch extends string> extends BaseNodeExpression {
  branch(branches: Partial<Record<TBranch, readonly AnyNodeExpression[]>>): NodeExpression<TBranch>;
}

export type AnyNodeExpression = BaseNodeExpression | BranchingNodeExpression<string>;
export type NodeExpression<TBranch extends string = never> = [TBranch] extends [never]
  ? BaseNodeExpression
  : BranchingNodeExpression<TBranch>;

export interface TriggerExpression {
  readonly title?: string;
  readonly type: string;
  readonly config: unknown;
}

export interface NodeFactory<TType extends string, TConfig, TBranch extends string = never> {
  (source: NodeSourceInput<TConfig>): NodeExpression<TBranch>;
  readonly type: TType;
  readonly branches: readonly TBranch[] | null | ((config: TConfig) => readonly string[]);
  readonly validateConfig: (config: unknown) => ConfigIssue[];
  readonly configSchema?: JSONSchema;
}

export interface TriggerFactory<TType extends string, TConfig> {
  (source: TriggerSourceInput<TConfig>): TriggerExpression;
  readonly type: TType;
  readonly validateConfig: (config: unknown) => ConfigIssue[];
  readonly configSchema?: JSONSchema;
}

export interface WorkflowSourceInput {
  title: string;
  description?: string;
  options?: JsonObject;
  inputs?: WorkflowInputSchema;
  trigger: TriggerExpression;
  nodes: readonly AnyNodeExpression[];
}

export interface TriggerSourceAst {
  type: string;
  title?: string;
  config: JsonObject;
}

export interface NodeSourceAst {
  key: string;
  title?: string;
  type: string;
  config: JsonObject;
  branches?: Record<string, NodeSourceAst[]>;
}

export interface WorkflowSourceAst {
  title: string;
  description?: string;
  options?: JsonObject;
  inputs?: WorkflowInputSchema;
  trigger: TriggerSourceAst;
  nodes: NodeSourceAst[];
}

export type WorkflowDefinition = WorkflowSourceAst;

export interface WorkflowFlatNode {
  key: string;
  title?: string;
  type: string;
  config: JsonObject;
  upstreamKey: string | null;
  downstreamKey: string | null;
  branchKey: string | null;
}

export interface WorkflowFlatIr {
  title: string;
  description?: string;
  options?: JsonObject;
  inputs?: WorkflowInputSchema;
  trigger: TriggerSourceAst;
  start: string | null;
  nodes: WorkflowFlatNode[];
}
