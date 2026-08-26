import { useEffect, useMemo, useState } from 'react';
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import { Flag, GitBranch, Terminal, Zap } from 'lucide-react';
import '@xyflow/react/dist/style.css';
import {
  applyLayoutResult,
  createLayoutInput,
  projectWorkflowGraph,
} from '@nocobase/app-plugin-workflow/client';
import { layoutWithElk } from './graph/elk-layout';
import type { WorkflowCanvasProps, WorkflowNodeRunRecord } from './types';
import './workflow-canvas.css';

interface CanvasNodeData extends Record<string, unknown> {
  title: string;
  description: string | null;
  nodeType: string | null;
  kind: string;
  status: string;
  attempts: readonly WorkflowNodeRunRecord[];
  onViewNodeRun?: (nodeRun: WorkflowNodeRunRecord) => void;
  onViewStartContext?: () => void;
}
function CanvasNode({ data }: NodeProps<Node<CanvasNodeData>>) {
  const boundary = data.kind === 'start' || data.kind === 'end';
  const condition = data.nodeType === 'condition';
  const Icon =
    data.kind === 'start'
      ? Zap
      : data.kind === 'end'
        ? Flag
        : condition
          ? GitBranch
          : Terminal;
  return (
    <div
      className={`workflow-flow-node ${boundary ? 'boundary' : ''} ${data.kind} ${data.nodeType ?? ''} ${data.status}`}
    >
      {data.kind !== 'start' ? (
        <Handle
          type='target'
          position={Position.Left}
          className='workflow-flow-handle'
        />
      ) : null}
      <span className='workflow-flow-icon' aria-hidden='true'>
        <Icon />
      </span>
      <span className='workflow-flow-copy'>
        <strong>{data.title}</strong>
        {data.description ? <small>{data.description}</small> : null}
      </span>
      {data.kind === 'end' ? null : condition ? (
        <>
          <Handle
            type='source'
            id='no'
            position={Position.Right}
            style={{ top: '35%' }}
            className='workflow-flow-handle workflow-flow-branch-handle no'
          />
          <Handle
            type='source'
            id='yes'
            position={Position.Right}
            style={{ top: '65%' }}
            className='workflow-flow-handle workflow-flow-branch-handle yes'
          />
        </>
      ) : (
        <Handle
          type='source'
          position={Position.Right}
          className='workflow-flow-handle'
        />
      )}
    </div>
  );
}
const nodeTypes = { workflow: CanvasNode };

export function WorkflowCanvas({
  definition,
  overlay,
  nodeRuns = [],
  selectedNodeKey,
  onSelectNode,
  onViewNodeRun,
  onViewStartContext,
}: WorkflowCanvasProps) {
  const graph = useMemo(() => projectWorkflowGraph(definition), [definition]);
  const [layout, setLayout] = useState<{
    graph: typeof graph;
    positions: ReadonlyMap<string, { id: string; x: number; y: number }>;
  }>(() => ({ graph, positions: new Map() }));
  const [fittedGraph, setFittedGraph] = useState<typeof graph | null>(null);
  useEffect(() => {
    let active = true;
    void layoutWithElk(createLayoutInput(graph)).then((result) => {
      if (active)
        setLayout({
          graph,
          positions: applyLayoutResult(graph, result).positions,
        });
    });
    return () => {
      active = false;
    };
  }, [graph]);
  const positions = useMemo<
    ReadonlyMap<string, { id: string; x: number; y: number }>
  >(
    () => (layout.graph === graph ? layout.positions : new Map()),
    [graph, layout],
  );
  const viewportReady = fittedGraph === graph;
  const attemptsByNode = useMemo(() => {
    const result = new Map<string, WorkflowNodeRunRecord[]>();
    for (const run of nodeRuns)
      result.set(run.nodeKey, [...(result.get(run.nodeKey) ?? []), run]);
    return result;
  }, [nodeRuns]);
  const ready = positions.size === graph.nodes.length;
  const nodes = useMemo<Node<CanvasNodeData>[]>(
    () =>
      graph.nodes.map((node) => ({
        id: node.id,
        type: 'workflow',
        position: positions.get(node.id) ?? { x: 0, y: 0 },
        data: {
          title: node.title,
          description: node.description,
          nodeType: node.nodeType,
          kind: node.kind,
          status: overlay?.nodeStatus.get(node.id) ?? 'unvisited',
          attempts: node.workflowNodeKey
            ? (attemptsByNode.get(node.workflowNodeKey) ?? [])
            : [],
          onViewNodeRun,
          onViewStartContext,
        },
        draggable: false,
        selectable: node.kind !== 'end',
        width: node.width,
        height: node.height,
        className:
          node.workflowNodeKey === selectedNodeKey
            ? 'workflow-selected'
            : undefined,
      })),
    [
      attemptsByNode,
      graph,
      onViewNodeRun,
      onViewStartContext,
      overlay,
      positions,
      selectedNodeKey,
    ],
  );
  const edges = useMemo<Edge[]>(
    () =>
      graph.edges.map((edge) => {
        const traversed = overlay?.traversedEdgeIds.has(edge.id) ?? false;
        return {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          sourceHandle:
            edge.kind === 'branch' ? (edge.branchKey ?? undefined) : undefined,
          type: 'default',
          label: edge.label ?? undefined,
          labelStyle: {
            fill: traversed ? 'var(--foreground)' : 'var(--muted-foreground)',
            fontSize: 12,
            fontWeight: 650,
          },
          labelBgStyle: { fill: 'var(--background)', fillOpacity: 0.96 },
          labelBgPadding: [7, 4],
          labelBgBorderRadius: 8,
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 18,
            height: 18,
            color: traversed
              ? 'var(--foreground)'
              : 'var(--workflow-edge-muted)',
          },
          style: {
            stroke: traversed
              ? 'var(--foreground)'
              : 'var(--workflow-edge-muted)',
            strokeWidth: traversed ? 2.4 : 1.3,
            strokeDasharray: traversed ? undefined : '6 5',
          },
        };
      }),
    [graph, overlay],
  );
  const minimapColor = (node: Node<CanvasNodeData>): string =>
    node.data.status === 'resolved'
      ? 'var(--workflow-success-soft)'
      : node.data.status === 'pending'
        ? 'var(--workflow-pending-soft)'
        : node.data.status === 'failed' || node.data.status === 'error'
          ? 'var(--workflow-error-soft)'
          : node.data.status === 'aborted'
            ? 'var(--workflow-aborted-soft)'
            : 'var(--secondary)';
  const minimapStroke = (node: Node<CanvasNodeData>): string =>
    node.data.status === 'resolved'
      ? 'var(--workflow-success)'
      : node.data.status === 'pending'
        ? 'var(--workflow-pending)'
        : node.data.status === 'failed' || node.data.status === 'error'
          ? 'var(--workflow-error)'
          : node.data.status === 'aborted'
            ? 'var(--workflow-aborted)'
            : node.data.kind === 'start' || node.data.kind === 'end'
              ? 'var(--workflow-emphasis-soft)'
              : 'var(--border)';
  const interactive = Boolean(onViewNodeRun || onViewStartContext);
  return (
    <div
      className='workflow-canvas'
      aria-label={
        interactive ? 'Workflow execution canvas' : 'Read-only workflow canvas'
      }
    >
      {ready ? (
        <>
          <ReactFlow
            className={`workflow-canvas-viewport${viewportReady ? ' ready' : ''}`}
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={interactive}
            onNodeClick={
              interactive
                ? (_, node) => {
                    if (node.id === 'end') return;
                    const graphNode = graph.nodes.find(
                      (item) => item.id === node.id,
                    );
                    if (!graphNode) return;
                    onSelectNode?.(graphNode.workflowNodeKey ?? null);
                    if (graphNode.kind === 'start') onViewStartContext?.();
                    else {
                      const latest = graphNode.workflowNodeKey
                        ? attemptsByNode.get(graphNode.workflowNodeKey)?.at(-1)
                        : undefined;
                      if (latest) onViewNodeRun?.(latest);
                    }
                  }
                : undefined
            }
            onPaneClick={interactive ? () => onSelectNode?.(null) : undefined}
            onInit={(instance) => {
              window.requestAnimationFrame(() => {
                void instance
                  .fitView({ padding: 0.22, minZoom: 0.35, maxZoom: 1.15 })
                  .then(() => setFittedGraph(graph));
              });
            }}
            minZoom={0.2}
            maxZoom={1.5}
          >
            <Background color='var(--border)' gap={24} size={1} />
            <MiniMap
              nodeColor={minimapColor}
              nodeStrokeColor={minimapStroke}
              nodeBorderRadius={8}
              maskColor='color-mix(in oklab, var(--muted) 72%, transparent)'
              pannable
              zoomable
            />
            <Controls />
          </ReactFlow>
          {viewportReady ? null : (
            <div className='workflow-canvas-loading'>正在适配全览视图…</div>
          )}
        </>
      ) : (
        <div className='workflow-canvas-loading'>正在布局流程…</div>
      )}
    </div>
  );
}
