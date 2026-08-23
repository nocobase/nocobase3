export type JsonPrimitive = null | boolean | number | string;
export type JsonValue =
  JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
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

export interface ContextSchema extends JSONSchema {
  readonly type: 'object';
}

export interface WorkflowNodeOptions {
  /** Maximum execution time in milliseconds. */
  timeout?: number;
}

export interface NodeResultSchemaBase {
  readonly title?: string;
  readonly description?: string;
  readonly examples?: readonly JsonValue[];
}

export interface NodeResultNullSchema extends NodeResultSchemaBase {
  readonly type: 'null';
}
export interface NodeResultBooleanSchema extends NodeResultSchemaBase {
  readonly type: 'boolean';
}
export interface NodeResultNumberSchema extends NodeResultSchemaBase {
  readonly type: 'number' | 'integer';
  readonly enum?: readonly number[];
}
export interface NodeResultStringSchema extends NodeResultSchemaBase {
  readonly type: 'string';
  readonly enum?: readonly string[];
}
export interface NodeResultArraySchema extends NodeResultSchemaBase {
  readonly type: 'array';
  readonly items: NodeResultSchema;
}
export interface NodeResultObjectSchema extends NodeResultSchemaBase {
  readonly type: 'object';
  readonly properties: Readonly<Record<string, NodeResultSchema>>;
  readonly required?: readonly string[];
  readonly additionalProperties?: boolean | NodeResultSchema;
}
export interface NodeResultUnionSchema extends NodeResultSchemaBase {
  readonly oneOf: readonly NodeResultSchema[];
}
export type NodeResultSchema =
  | NodeResultNullSchema
  | NodeResultBooleanSchema
  | NodeResultNumberSchema
  | NodeResultStringSchema
  | NodeResultArraySchema
  | NodeResultObjectSchema
  | NodeResultUnionSchema;

export interface WorkflowNodeSourceInput<TConfig> {
  key: string;
  title?: string;
  description?: string;
  config: TConfig;
  options?: WorkflowNodeOptions;
  result?: NodeResultSchema | null;
}

export interface BaseNodeExpression {
  readonly key: string;
  readonly title?: string;
  readonly description?: string;
  readonly type: string;
  readonly config: unknown;
  readonly options?: WorkflowNodeOptions;
  readonly result?: NodeResultSchema | null;
}

export interface BranchingNodeExpression<
  TBranch extends string,
> extends BaseNodeExpression {
  branch(
    branches: Partial<Record<TBranch, readonly AnyNodeExpression[]>>,
  ): NodeExpression<TBranch>;
}

export type AnyNodeExpression =
  BaseNodeExpression | BranchingNodeExpression<string>;
export type NodeExpression<TBranch extends string = never> =
  string extends TBranch
    ? AnyNodeExpression
    : [TBranch] extends [never]
      ? BaseNodeExpression
      : BranchingNodeExpression<TBranch>;

export interface WorkflowSourceInput {
  title: string;
  description?: string;
  options?: JsonObject;
  inputs?: WorkflowInputSchema;
  contextSchema?: ContextSchema;
  nodes: readonly AnyNodeExpression[];
}

export interface NodeSourceAst {
  key: string;
  title?: string;
  description?: string;
  type: string;
  config: JsonObject;
  options?: WorkflowNodeOptions;
  result?: NodeResultSchema | null;
  branches?: Record<string, NodeSourceAst[]>;
}

export interface WorkflowSourceAst {
  title: string;
  description?: string;
  options?: JsonObject;
  inputs?: WorkflowInputSchema;
  contextSchema: ContextSchema;
  nodes: NodeSourceAst[];
}

export type WorkflowDefinition = WorkflowSourceAst;

export interface WorkflowFlatNode {
  key: string;
  title?: string;
  description?: string;
  type: string;
  config: JsonObject;
  options?: WorkflowNodeOptions;
  result?: NodeResultSchema;
  upstreamKey: string | null;
  downstreamKey: string | null;
  branchKey: string | null;
}

export interface WorkflowFlatIr {
  title: string;
  description?: string;
  options?: JsonObject;
  inputs?: WorkflowInputSchema;
  contextSchema: ContextSchema;
  start: string | null;
  nodes: WorkflowFlatNode[];
}
