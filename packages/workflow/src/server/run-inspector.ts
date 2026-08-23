import type { WorkflowLogger, WorkflowNode } from './types.js';

export interface RunNodeInspectorProjection { type: string; title: string; script: string; artifactShortId: string; sourceManaged: true; argsKeys: string[]; }
export interface RunExecutionLogFields { workflowId: string | number; executionId: string | number; nodeId: string | number; nodeKey: string; artifactDigest: string | null; script: string; durationMs: number; status: 'success' | 'error' | 'aborted'; }

export function projectRunNodeInspector(node: WorkflowNode, artifactDigest: string): RunNodeInspectorProjection {
  const args = node.config.args;
  return { type: node.type, title: node.title ?? node.key, script: String(node.config.script ?? ''), artifactShortId: artifactDigest.slice(0, 12), sourceManaged: true, argsKeys: args && typeof args === 'object' && !Array.isArray(args) ? Object.keys(args as object).sort() : [] };
}

export function logRunExecution(logger: WorkflowLogger, fields: RunExecutionLogFields): void {
  logger.info(`Run node "${fields.nodeKey}" ${fields.status}`, fields);
}
