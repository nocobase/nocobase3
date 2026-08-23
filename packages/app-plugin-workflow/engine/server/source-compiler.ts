import {
  compileToFlatIr,
  type WorkflowFlatIr,
  type WorkflowSourceAst,
} from '../workflow-source/core.js';

import {
  WorkflowSourceCheckError,
  type WorkflowSourceIssue,
} from './source-issues.js';
import { createNodeResultSchemaResolver } from './node-results.js';
import type {
  WorkflowSourceContracts,
  WorkflowSourceRuntimeContracts,
} from './source-validator.js';

export function validateWorkflowFlatIrTopology(ir: WorkflowFlatIr): void {
  const byKey = new Map(ir.nodes.map((node) => [node.key, node]));
  if (byKey.size !== ir.nodes.length)
    throw new Error('Flat IR contains duplicate node keys');
  if (ir.nodes.length === 0) {
    if (ir.start !== null)
      throw new Error('Flat IR start must be null when there are no nodes');
    return;
  }
  if (ir.start === null || !byKey.has(ir.start))
    throw new Error('Flat IR start must reference an existing node');
  const incoming = new Map<string, string>();
  const adjacency = new Map<string, string[]>();
  for (const node of ir.nodes) adjacency.set(node.key, []);
  for (const node of ir.nodes) {
    if (node.downstreamKey !== null) {
      if (node.downstreamKey === node.key)
        throw new Error(`Node "${node.key}" cannot reference itself`);
      if (!byKey.has(node.downstreamKey))
        throw new Error(
          `Node "${node.key}" references missing node "${node.downstreamKey}"`,
        );
      if (incoming.has(node.downstreamKey))
        throw new Error(
          `Node "${node.downstreamKey}" has multiple upstream owners`,
        );
      incoming.set(node.downstreamKey, node.key);
      adjacency.get(node.key)?.push(node.downstreamKey);
    }
    if (node.branchKey !== null) {
      if (node.upstreamKey === null || !byKey.has(node.upstreamKey))
        throw new Error(`Node "${node.key}" has no upstream owner`);
      if (incoming.has(node.key))
        throw new Error(`Node "${node.key}" has multiple upstream owners`);
      incoming.set(node.key, node.upstreamKey);
      adjacency.get(node.upstreamKey)?.push(node.key);
    }
  }
  const start = byKey.get(ir.start);
  if (start?.upstreamKey !== null || incoming.has(ir.start))
    throw new Error(`Start node "${ir.start}" cannot have an upstream owner`);
  for (const node of ir.nodes) {
    if (node.key !== ir.start && !incoming.has(node.key))
      throw new Error(`Node "${node.key}" has no upstream owner`);
    if (node.key !== ir.start && incoming.get(node.key) !== node.upstreamKey)
      throw new Error(`Node "${node.key}" has inconsistent upstream owner`);
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (key: string): void => {
    if (visiting.has(key))
      throw new Error(`Flat IR topology contains a cycle at node "${key}"`);
    if (visited.has(key)) return;
    visiting.add(key);
    for (const target of adjacency.get(key) ?? []) visit(target);
    visiting.delete(key);
    visited.add(key);
  };
  visit(ir.start);
  if (visited.size !== ir.nodes.length)
    throw new Error(
      'Flat IR contains nodes that are not reachable from its start',
    );
}

export function compileWorkflowSource(
  ast: WorkflowSourceAst,
  file: string,
  contracts?: WorkflowSourceContracts | WorkflowSourceRuntimeContracts,
): WorkflowFlatIr {
  try {
    const ir = compileToFlatIr(
      ast,
      contracts === undefined
        ? undefined
        : createNodeResultSchemaResolver(contracts),
    );
    validateWorkflowFlatIrTopology(ir);
    return ir;
  } catch (error) {
    const issue: WorkflowSourceIssue = {
      phase: 'compile',
      code: 'INVALID_TOPOLOGY',
      message: error instanceof Error ? error.message : String(error),
      file,
      nodeKey: 'workflow',
      astPath: 'workflow.nodes',
      contractType: 'WorkflowFlatIr',
    };
    throw new WorkflowSourceCheckError([issue]);
  }
}
