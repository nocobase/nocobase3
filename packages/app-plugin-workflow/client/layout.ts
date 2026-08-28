import type { WorkflowGraph } from './graph.js';

export type WorkflowLayoutDirection = 'RIGHT' | 'DOWN';
export interface WorkflowLayoutNode {
  readonly id: string;
  readonly width: number;
  readonly height: number;
}
export interface WorkflowLayoutEdge {
  readonly id: string;
  readonly source: string;
  readonly target: string;
}
export interface WorkflowLayoutInput {
  readonly direction: WorkflowLayoutDirection;
  readonly nodes: readonly WorkflowLayoutNode[];
  readonly edges: readonly WorkflowLayoutEdge[];
}
export interface WorkflowLayoutPosition {
  readonly id: string;
  readonly x: number;
  readonly y: number;
}
export interface WorkflowLayoutResult {
  readonly positions: readonly WorkflowLayoutPosition[];
}
export interface PositionedWorkflowGraph {
  readonly graph: WorkflowGraph;
  readonly positions: ReadonlyMap<string, WorkflowLayoutPosition>;
}

export function createLayoutInput(
  graph: WorkflowGraph,
  direction: WorkflowLayoutDirection = 'RIGHT',
): WorkflowLayoutInput {
  return {
    direction,
    nodes: graph.nodes.map((node) => ({
      id: node.id,
      width: node.width,
      height: node.height,
    })),
    edges: graph.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
    })),
  };
}

export function applyLayoutResult(
  graph: WorkflowGraph,
  result: WorkflowLayoutResult,
): PositionedWorkflowGraph {
  return {
    graph,
    positions: new Map(
      result.positions.map((position) => [position.id, position]),
    ),
  };
}
