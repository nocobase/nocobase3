import type { QueryAdapter, Row } from '@nocobase/app-database';

import { WORKFLOW_COLLECTIONS } from '../collections/names.js';
import type {
  JsonObject,
  WorkflowDefinition,
  WorkflowId,
  WorkflowLogger,
  WorkflowNode,
  WorkflowRun,
  WorkflowNodeRun,
} from './types.js';
import type {
  WorkflowParameterSchema,
  WorkflowParameterValues,
} from './parameters.js';
import type { WorkflowInputSchema } from './invocation.js';

export const noopWorkflowLogger: WorkflowLogger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

export function parseJson<T>(value: unknown, fallback: T): T {
  if (value == null || value === '') {
    return fallback;
  }
  if (typeof value !== 'string') {
    return value as T;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function serializeJson(value: unknown): string {
  return JSON.stringify(value, (_key, item) =>
    typeof item === 'bigint' ? item.toString() : item,
  );
}

export function asId(value: unknown, field: string = 'id'): WorkflowId {
  if (typeof value === 'number' || typeof value === 'string') {
    return value;
  }
  throw new Error(`Expected ${field} to be a number or string`);
}

function asNullableString(value: unknown): string | null {
  if (value == null) {
    return null;
  }
  return value instanceof Date ? value.toISOString() : String(value);
}

function asBoolean(value: unknown): boolean {
  return value === true || value === 1 || value === '1';
}

export function hydrateWorkflowNode(row: Row): WorkflowNode {
  return {
    id: asId(row.id),
    key: String(row.key),
    title: asNullableString(row.title),
    description: asNullableString(row.description),
    workflowId: asId(row.workflowId, 'workflowId'),
    upstreamKey: asNullableString(row.upstreamKey),
    branchKey: asNullableString(row.branchKey),
    downstreamKey: asNullableString(row.downstreamKey),
    type: String(row.type),
    config: parseJson<JsonObject>(row.config, {}),
    options: parseJson(row.options, {}),
  };
}

export function hydrateWorkflow(
  row: Row,
  nodes: WorkflowNode[] = [],
): WorkflowDefinition {
  return {
    id: asId(row.id),
    key: String(row.key),
    hash: asNullableString(row.hash),
    version: asNullableString(row.version),
    title: asNullableString(row.title),
    enabled: asBoolean(row.enabled),
    description: asNullableString(row.description),
    inputSchema: parseJson<WorkflowInputSchema>(row.inputSchema, {
      type: 'object',
    }),
    parametersSchema: parseJson<WorkflowParameterSchema>(
      row.parametersSchema,
      {},
    ),
    parameterValues: parseJson<WorkflowParameterValues>(
      row.parameterValues,
      {},
    ),
    current: row.current == null ? null : asBoolean(row.current),
    options: parseJson<JsonObject>(row.options, {}),
    nodes,
  };
}

export function hydrateRun(row: Row): WorkflowRun {
  return {
    id: asId(row.id),
    workflowId: asId(row.workflowId, 'workflowId'),
    workflowKey: String(row.workflowKey),
    hash: asNullableString(row.hash),
    eventKey: String(row.eventKey),
    input: parseJson<JsonObject>(row.input, {}),
    parameters: parseJson<WorkflowParameterValues>(row.parameters, {}),
    status: row.status == null ? null : Number(row.status),
    dispatched: asBoolean(row.dispatched),
    parentRunId:
      row.parentRunId == null ? null : asId(row.parentRunId, 'parentRunId'),
    stack: parseJson<WorkflowId[]>(row.stack, []),
    output: parseJson(row.output, null),
    startedAt: asNullableString(row.startedAt),
    finishedAt: asNullableString(row.finishedAt),
    expiresAt: asNullableString(row.expiresAt),
    createdAt: asNullableString(row.createdAt) ?? new Date(0).toISOString(),
    manually: asBoolean(row.manually),
    reason: asNullableString(row.reason),
  };
}

export function hydrateNodeRun(row: Row): WorkflowNodeRun {
  return {
    id: asId(row.id),
    workflowRunId: asId(row.workflowRunId, 'workflowRunId'),
    nodeId: asId(row.nodeId, 'nodeId'),
    nodeKey: String(row.nodeKey),
    status: Number(row.status),
    meta: parseJson(row.meta, null),
    result: parseJson(row.result, null),
    error: asNullableString(row.error),
    startedAt: asNullableString(row.startedAt) ?? new Date(0).toISOString(),
    finishedAt: asNullableString(row.finishedAt),
    expiresAt: asNullableString(row.expiresAt),
    log: asNullableString(row.log),
  };
}

export async function loadWorkflow(
  query: QueryAdapter,
  id: WorkflowId,
): Promise<WorkflowDefinition | null> {
  const row = await query
    .selectFrom(WORKFLOW_COLLECTIONS.workflows)
    .selectAll()
    .where('id', '=', id)
    .executeTakeFirst<Row>();
  if (!row) {
    return null;
  }
  const nodes = await query
    .selectFrom(WORKFLOW_COLLECTIONS.nodes)
    .selectAll()
    .where('workflowId', '=', id)
    .orderBy('id')
    .execute<Row>();
  return hydrateWorkflow(row, nodes.map(hydrateWorkflowNode));
}

export async function loadRun(
  query: QueryAdapter,
  id: WorkflowId,
): Promise<WorkflowRun | null> {
  const row = await query
    .selectFrom(WORKFLOW_COLLECTIONS.runs)
    .selectAll()
    .where('id', '=', id)
    .executeTakeFirst<Row>();
  return row ? hydrateRun(row) : null;
}

export async function loadNodeRun(
  query: QueryAdapter,
  id: WorkflowId,
): Promise<WorkflowNodeRun | null> {
  const row = await query
    .selectFrom(WORKFLOW_COLLECTIONS.nodeRuns)
    .selectAll()
    .where('id', '=', id)
    .executeTakeFirst<Row>();
  return row ? hydrateNodeRun(row) : null;
}
