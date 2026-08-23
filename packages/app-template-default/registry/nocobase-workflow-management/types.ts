import type { WorkflowExecutionOverlay, WorkflowGraph } from '@nocobase/workflow/client';
import type { WorkflowSourceAst } from '@nocobase/workflow';
import type { JsonObject } from '@nocobase/workflow';

export interface WorkflowListRecord { id: string; key: string; title: string | null; description?: string | null; enabled: boolean; current: boolean | null; hasInputs: boolean; executed: number; version?: string | null; hash?: string | null; activeRunCount?: number; latestRun?: { id: string; status: number | null; createdAt: string } | null; }
export interface WorkflowNodeRecord { id: string; key: string; title: string | null; description: string | null; type: string; config: JsonObject; upstreamKey: string | null; downstreamKey: string | null; branchKey: string | null; }
export interface WorkflowDetailRecord extends WorkflowListRecord { description: string | null; hash: string | null; version: string | null; contextSchema: object; inputSchema: Record<string, WorkflowInputDeclaration>; inputValues: Record<string, string | number | boolean>; nodes: WorkflowNodeRecord[]; }
export interface WorkflowInputDeclaration { type: 'string' | 'number' | 'boolean'; title?: string; description?: string; default?: string | number | boolean; enum?: Array<{ label: string; value: string | number }>; }
export interface WorkflowRunRecord { id: string; workflowId: string; workflowKey: string; workflowTitle?: string | null; workflowVersion?: string | null; eventKey: string; status: number | null; context?: unknown; nodeRuns?: WorkflowNodeRunRecord[]; createdAt: string; startedAt?: string | null; finishedAt?: string | null; manually?: boolean; reason?: string | null; hash?: string | null; }
export interface WorkflowNodeRunRecord { id: string; workflowRunId: string; nodeId: string; nodeKey: string; status: number; startedAt: string; finishedAt: string | null; branchKey: string | null; }
export interface WorkflowNodeRunPayload { id: string; result: unknown; error: string | null; log: string | null; truncated: boolean; }
export interface WorkflowCanvasProps { definition: WorkflowSourceAst; overlay?: WorkflowExecutionOverlay; nodeRuns?: readonly WorkflowNodeRunRecord[]; selectedNodeKey?: string | null; onSelectNode?: (nodeKey: string | null) => void; onViewNodeRun?: (nodeRun: WorkflowNodeRunRecord) => void; onViewStartContext?: () => void; }
export interface WorkflowCanvasModel { graph: WorkflowGraph; layoutKey: string; }
