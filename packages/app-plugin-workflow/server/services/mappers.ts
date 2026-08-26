import type { Row } from '@nocobase/database';
import type {
  JsonObject,
  JsonValue,
  WorkflowDefinition,
  WorkflowId,
} from '../engine/index.js';
import type { WorkflowDistArtifact } from '../loader/index.js';
import { BadRequestError } from './errors.js';
import type {
  WorkflowDefinitionView,
  WorkflowListItem,
  WorkflowNodeRunSummary,
  WorkflowRunListItem,
} from './types.js';

export function asWorkflowId(value: unknown): WorkflowId {
  if (typeof value === 'number' || typeof value === 'string') return value;
  throw new Error('Workflow row has an invalid id.');
}

export function normalizePage(options: { page?: number; pageSize?: number }): {
  page: number;
  pageSize: number;
  offset: number;
} {
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 20));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

export function toWorkflowListItem(
  row: Row,
  executed: number,
  activeRunCount: number = 0,
  latestRun?: Row,
): WorkflowListItem {
  return {
    id: String(asWorkflowId(row.id)),
    key: String(row.key ?? ''),
    title: row.title == null ? null : String(row.title),
    enabled: row.enabled === true || row.enabled === 1 || row.enabled === '1',
    current:
      row.current == null
        ? null
        : row.current === true || row.current === 1 || row.current === '1',
    hasInputs: hasObjectKeys(row.inputSchema),
    executed,
    version: row.version == null ? null : String(row.version),
    hash: row.hash == null ? null : String(row.hash),
    activeRunCount,
    latestRun: latestRun
      ? {
          id: String(latestRun.id),
          status: latestRun.status == null ? null : Number(latestRun.status),
          createdAt:
            latestRun.createdAt instanceof Date
              ? latestRun.createdAt.toISOString()
              : String(latestRun.createdAt ?? ''),
        }
      : null,
    registered: true,
    canEnable: !(
      row.enabled === true ||
      row.enabled === 1 ||
      row.enabled === '1'
    ),
    deployedHash: null,
    currentHash: row.hash == null ? null : String(row.hash),
  };
}

export function toDiscoveredWorkflowDefinition(
  artifact: WorkflowDistArtifact,
): WorkflowDefinitionView {
  return {
    id: artifact.key,
    key: artifact.key,
    title: artifact.workflow.title ?? null,
    description: artifact.workflow.description ?? null,
    hash: artifact.digest,
    version: null,
    enabled: false,
    current: null,
    executed: 0,
    latestRun: null,
    contextSchema: artifact.workflow.contextSchema,
    inputSchema: artifact.workflow.inputs ?? {},
    inputValues: {},
    nodes: artifact.workflow.nodes.map((node, index) => ({
      id: `${artifact.key}:${index}`,
      key: node.key,
      title: node.title ?? null,
      description: node.description ?? null,
      type: node.type,
      config: node.config,
      upstreamKey: node.upstreamKey,
      downstreamKey: node.downstreamKey,
      branchKey: node.branchKey,
    })),
  };
}

export function toWorkflowDefinitionView(
  workflow: WorkflowDefinition,
): Omit<WorkflowDefinitionView, 'executed' | 'latestRun'> {
  return {
    id: String(workflow.id),
    key: workflow.key,
    title: workflow.title,
    description: workflow.description,
    hash: workflow.hash,
    version: workflow.version,
    enabled: workflow.enabled,
    current: workflow.current,
    contextSchema: workflow.contextSchema,
    inputSchema: workflow.inputSchema,
    inputValues: workflow.inputValues,
    nodes: workflow.nodes.map((node) => ({
      id: String(node.id),
      key: node.key,
      title: node.title,
      description: node.description,
      type: node.type,
      config: node.config,
      upstreamKey: node.upstreamKey,
      downstreamKey: node.downstreamKey,
      branchKey: node.branchKey,
    })),
  };
}

export function toRunItem(
  row: Row,
  workflowTitle: string | null = null,
  workflowVersion: string | null = null,
): WorkflowRunListItem {
  return {
    id: String(asWorkflowId(row.id)),
    workflowId: String(asWorkflowId(row.workflowId)),
    workflowKey: String(row.workflowKey ?? ''),
    workflowTitle,
    workflowVersion,
    eventKey: String(row.eventKey ?? ''),
    status: row.status == null ? null : Number(row.status),
    createdAt: toDateString(row.createdAt) ?? '',
    startedAt: toDateString(row.startedAt),
    finishedAt: toDateString(row.finishedAt),
  };
}

export function toNodeRunSummary(row: Row): WorkflowNodeRunSummary {
  return {
    id: String(asWorkflowId(row.id)),
    workflowRunId: String(asWorkflowId(row.workflowRunId)),
    nodeId: String(asWorkflowId(row.nodeId)),
    nodeKey: String(row.nodeKey),
    status: Number(row.status),
    startedAt: toDateString(row.startedAt) ?? '',
    finishedAt: toDateString(row.finishedAt),
    branchKey: null,
  };
}

export function parsePayload(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

export function redactPayload(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactPayload);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      /password|secret|token|authorization|cookie/i.test(key)
        ? '[REDACTED]'
        : redactPayload(item),
    ]),
  );
}

export function redactLog(value: string): string {
  return value.replace(
    /(password|secret|token|authorization|cookie)\s*[:=]\s*[^\s,;]+/gi,
    '$1=[REDACTED]',
  );
}

export function requireJsonObject(value: unknown): JsonObject {
  if (!isJsonObject(value))
    throw new BadRequestError('Workflow context must be a JSON object.');
  return value;
}

function hasObjectKeys(value: unknown): boolean {
  if (typeof value === 'string') {
    try {
      return hasObjectKeys(JSON.parse(value) as unknown);
    } catch {
      return false;
    }
  }
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length > 0
  );
}

function isJsonObject(value: unknown): value is JsonObject {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.values(value).every(isJsonValue)
  );
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === 'boolean' || typeof value === 'string')
    return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  return isJsonObject(value);
}

function toDateString(value: unknown): string | null {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}
