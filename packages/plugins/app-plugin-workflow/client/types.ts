export type JsonPrimitive = null | boolean | number | string;
export type JsonValue =
  JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue };
export type JsonObject = { readonly [key: string]: JsonValue };

export interface WorkflowGraphDefinitionNode {
  readonly key: string;
  readonly title?: string;
  readonly description?: string;
  readonly type: string;
  readonly config: JsonObject;
  readonly branches?: Readonly<
    Record<string, readonly WorkflowGraphDefinitionNode[]>
  >;
}

export interface WorkflowGraphDefinition {
  readonly title: string;
  readonly nodes: readonly WorkflowGraphDefinitionNode[];
}

export interface WorkflowFlatDefinitionNode {
  readonly key: string;
  readonly title?: string;
  readonly description?: string;
  readonly type: string;
  readonly config: JsonObject;
  readonly options?: JsonObject;
  readonly result?: JsonValue;
  readonly upstreamKey: string | null;
  readonly downstreamKey: string | null;
  readonly branchKey: string | null;
}

export interface WorkflowFlatDefinition {
  readonly title: string;
  readonly description?: string;
  readonly options?: JsonObject;
  readonly parameters?: JsonObject;
  readonly inputSchema: JsonObject;
  readonly start: string | null;
  readonly nodes: readonly WorkflowFlatDefinitionNode[];
}

export interface WorkflowNestedDefinition extends WorkflowGraphDefinition {
  readonly description?: string;
  readonly options?: JsonObject;
  readonly parameters?: JsonObject;
  readonly inputSchema: JsonObject;
}
