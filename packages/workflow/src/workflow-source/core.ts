export type {
  AnyNodeExpression,
  BaseNodeExpression,
  BranchingNodeExpression,
  ConfigIssue,
  JSONSchema,
  JsonObject,
  JsonPrimitive,
  JsonValue,
  NodeExpression,
  NodeFactory,
  NodeFactorySpec,
  NodeSourceAst,
  NodeSourceInput,
  TriggerExpression,
  TriggerFactory,
  TriggerFactorySpec,
  TriggerSourceAst,
  TriggerSourceInput,
  WorkflowDefinition,
  WorkflowFlatIr,
  WorkflowFlatNode,
  WorkflowInputDeclaration,
  WorkflowInputOption,
  WorkflowInputSchema,
  WorkflowSourceAst,
  WorkflowSourceInput,
} from './types.js';

import type {
  AnyNodeExpression,
  BaseNodeExpression,
  BranchingNodeExpression,
  JsonObject,
  NodeExpression,
  NodeFactory,
  NodeFactorySpec,
  NodeSourceAst,
  TriggerExpression,
  TriggerFactory,
  TriggerFactorySpec,
  WorkflowFlatIr,
  WorkflowFlatNode,
  WorkflowSourceAst,
  WorkflowSourceInput,
} from './types.js';

const EXPRESSION_BRANCHES: unique symbol = Symbol('workflow.expression.branches');
type InternalExpression = AnyNodeExpression & { readonly [EXPRESSION_BRANCHES]?: Record<string, readonly AnyNodeExpression[]> };

function copyMetadata<TConfig, TBranch extends string>(
  factory: NodeFactory<string, TConfig, TBranch>,
  spec: NodeFactorySpec<string, TConfig, TBranch>,
): void {
  Object.defineProperties(factory, {
    type: { value: spec.type, enumerable: true },
    branches: { value: spec.branches, enumerable: true },
    validateConfig: { value: spec.validateConfig, enumerable: true },
    ...(spec.configSchema === undefined ? {} : { configSchema: { value: spec.configSchema, enumerable: true } }),
  });
}

export function defineNode<TType extends string, TConfig, TBranch extends string = never>(
  spec: NodeFactorySpec<TType, TConfig, TBranch>,
): NodeFactory<TType, TConfig, TBranch> {
  const create = (source: { key: string; title?: string; config: TConfig }): NodeExpression<TBranch> => {
    const base: BaseNodeExpression = Object.freeze({
      key: source.key,
      ...(source.title === undefined ? {} : { title: source.title }),
      type: spec.type,
      config: source.config,
    });
    if (spec.branches === null) {
      return base as NodeExpression<TBranch>;
    }
    const branching: BranchingNodeExpression<TBranch> = {
      ...base,
      branch(branches: Partial<Record<TBranch, readonly AnyNodeExpression[]>>): NodeExpression<TBranch> {
        const next = { ...base, branch: branching.branch } as BranchingNodeExpression<TBranch> & InternalExpression;
        Object.defineProperty(next, EXPRESSION_BRANCHES, { value: branches });
        return Object.freeze(next) as NodeExpression<TBranch>;
      },
    };
    return Object.freeze(branching) as NodeExpression<TBranch>;
  };
  const factory = create as NodeFactory<TType, TConfig, TBranch>;
  copyMetadata(factory as NodeFactory<string, TConfig, TBranch>, spec);
  return factory;
}

export function defineTrigger<TType extends string, TConfig>(
  spec: TriggerFactorySpec<TType, TConfig>,
): TriggerFactory<TType, TConfig> {
  const factory = ((source: { title?: string; config: TConfig }): TriggerExpression => Object.freeze({
    ...(source.title === undefined ? {} : { title: source.title }),
    type: spec.type,
    config: source.config,
  })) as TriggerFactory<TType, TConfig>;
  Object.defineProperties(factory, {
    type: { value: spec.type, enumerable: true },
    validateConfig: { value: spec.validateConfig, enumerable: true },
    ...(spec.configSchema === undefined ? {} : { configSchema: { value: spec.configSchema, enumerable: true } }),
  });
  return factory;
}

function toJsonObject(value: unknown, location: string): JsonObject {
  assertJsonCompatible(value, location);
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${location} must be an object`);
  }
  return value as JsonObject;
}

function assertJsonCompatible(value: unknown, location: string, ancestors: Set<object> = new Set<object>()): void {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`${location} must contain only finite numbers`);
    return;
  }
  if (typeof value !== 'object') throw new TypeError(`${location} must be JSON-compatible`);
  if (ancestors.has(value)) throw new TypeError(`${location} must not contain a circular reference`);
  if (!Array.isArray(value)) {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError(`${location} must not contain class instances, Date, or Map values`);
    }
  }
  ancestors.add(value);
  try {
    for (const [key, item] of Object.entries(value)) assertJsonCompatible(item, `${location}.${key}`, ancestors);
  } finally {
    ancestors.delete(value);
  }
}

function unwrapNode(expression: AnyNodeExpression, astPath: string): NodeSourceAst {
  const internal = expression as InternalExpression;
  const branches = internal[EXPRESSION_BRANCHES];
  const normalizedBranches: Record<string, NodeSourceAst[]> = {};
  for (const branchKey of Object.keys(branches ?? {}).sort()) {
    const block = branches?.[branchKey] ?? [];
    if (block.length) normalizedBranches[branchKey] = block.map((node, index) => unwrapNode(node, `${astPath}.branches.${branchKey}[${index}]`));
  }
  return {
    key: expression.key,
    ...(expression.title === undefined ? {} : { title: expression.title }),
    type: expression.type,
    config: toJsonObject(expression.config, `${astPath}.config`),
    ...(Object.keys(normalizedBranches).length ? { branches: normalizedBranches } : {}),
  };
}

export function defineWorkflow(source: WorkflowSourceInput): WorkflowSourceAst {
  const ast: WorkflowSourceAst = {
    title: source.title,
    ...(source.description === undefined ? {} : { description: source.description }),
    ...(source.options === undefined ? {} : { options: source.options }),
    ...(source.inputs === undefined ? {} : { inputs: source.inputs }),
    trigger: {
      type: source.trigger.type,
      ...(source.trigger.title === undefined ? {} : { title: source.trigger.title }),
      config: toJsonObject(source.trigger.config, 'workflow.trigger.config'),
    },
    nodes: source.nodes.map((node, index) => unwrapNode(node, `workflow.nodes[${index}]`)),
  };
  assertJsonCompatible(ast, 'workflow');
  return ast;
}

export function compileToFlatIr(ast: WorkflowSourceAst): WorkflowFlatIr {
  assertJsonCompatible(ast, 'workflow');
  const keys = new Set<string>();
  const collect = (block: readonly NodeSourceAst[]): void => {
    for (const node of block) {
      if (!node.key) throw new Error('Workflow node keys must be non-empty strings');
      if (keys.has(node.key)) throw new Error(`Duplicate workflow node key "${node.key}"`);
      keys.add(node.key);
      for (const branch of Object.values(node.branches ?? {})) collect(branch);
    }
  };
  collect(ast.nodes);

  const nodes: WorkflowFlatNode[] = [];
  const compileBlock = (block: readonly NodeSourceAst[], ownerKey: string | null, branchKey: string | null): void => {
    block.forEach((node, index) => {
      nodes.push({
        key: node.key,
        ...(node.title === undefined ? {} : { title: node.title }),
        type: node.type,
        config: node.config,
        upstreamKey: index === 0 ? ownerKey : block[index - 1].key,
        downstreamKey: index + 1 < block.length ? block[index + 1].key : null,
        branchKey: index === 0 ? branchKey : null,
      });
      for (const childBranchKey of Object.keys(node.branches ?? {}).sort()) {
        compileBlock(node.branches?.[childBranchKey] ?? [], node.key, childBranchKey);
      }
    });
  };
  compileBlock(ast.nodes, null, null);
  return {
    title: ast.title,
    ...(ast.description === undefined ? {} : { description: ast.description }),
    ...(ast.options === undefined ? {} : { options: ast.options }),
    ...(ast.inputs === undefined ? {} : { inputs: ast.inputs }),
    trigger: ast.trigger,
    start: ast.nodes[0]?.key ?? null,
    nodes,
  };
}

export function restoreFromFlatIr(ir: WorkflowFlatIr): WorkflowSourceAst {
  const byKey = new Map<string, WorkflowFlatNode>(ir.nodes.map((node) => [node.key, node]));
  if (byKey.size !== ir.nodes.length) throw new Error('Flat IR contains duplicate node keys');
  const children = new Map<string, WorkflowFlatNode[]>();
  for (const node of ir.nodes) {
    if (node.upstreamKey !== null && node.branchKey !== null) {
      const key = `${node.upstreamKey}\u0000${node.branchKey}`;
      children.set(key, [...(children.get(key) ?? []), node]);
    }
  }
  const buildBlock = (startKey: string | null): NodeSourceAst[] => {
    const result: NodeSourceAst[] = [];
    const seen = new Set<string>();
    let key = startKey;
    while (key !== null) {
      if (seen.has(key)) throw new Error(`Flat IR contains a cycle at node "${key}"`);
      seen.add(key);
      const node = byKey.get(key);
      if (!node) throw new Error(`Flat IR references missing node "${key}"`);
      const branches: Record<string, NodeSourceAst[]> = {};
      for (const childKey of [...children.keys()].filter((candidate) => candidate.startsWith(`${key}\u0000`)).sort()) {
        const branchKey = childKey.slice(key.length + 1);
        const roots = children.get(childKey) ?? [];
        if (roots.length !== 1) throw new Error(`Flat IR branch "${key}.${branchKey}" must have exactly one head`);
        branches[branchKey] = buildBlock(roots[0].key);
      }
      result.push({ key: node.key, ...(node.title === undefined ? {} : { title: node.title }), type: node.type, config: node.config, ...(Object.keys(branches).length ? { branches } : {}) });
      key = node.downstreamKey;
    }
    return result;
  };
  return {
    title: ir.title,
    ...(ir.description === undefined ? {} : { description: ir.description }),
    ...(ir.options === undefined ? {} : { options: ir.options }),
    ...(ir.inputs === undefined ? {} : { inputs: ir.inputs }),
    trigger: ir.trigger,
    nodes: buildBlock(ir.start),
  };
}
