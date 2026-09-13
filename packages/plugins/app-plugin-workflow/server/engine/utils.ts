import type { Row } from '@nocobase/db';

import type { WorkflowStore } from '../collections/store.js';
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

/**
 * The current instant, in the form every temporal column of this plugin holds.
 *
 * Those columns are `datetimeTz`, and the Repository reads and writes one as a
 * canonical UTC ISO-8601 string on every dialect, so this is both what goes in
 * and what comes back out. See `collections/store.ts`.
 */
export function nowInstant(): string {
  return new Date().toISOString();
}

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

/**
 * What every `json` column of this plugin is written as: JSON text.
 *
 * The Repository serializes an object or an array for the column itself, but a
 * scalar it binds exactly as given — and a bare `after-restart` or `false` is
 * not JSON, so PostgreSQL's `jsonb` rejects one and SQLite stores the other as
 * the number 0. A node result is arbitrary and is a scalar often enough that
 * the difference matters, so everything here is serialized on the way in and
 * `parseJson` reads it back. That is also the shape these columns have always
 * held, so nothing already stored has to change.
 *
 * `bigint` is rewritten rather than thrown on, because a node result can carry
 * an id and `JSON.stringify` refuses one outright.
 */
export function serializeJson(value: unknown): string {
  return JSON.stringify(value === undefined ? null : value, (_key, item) =>
    typeof item === 'bigint' ? item.toString() : item,
  );
}

export function asId(value: unknown, field: string = 'id'): WorkflowId {
  if (typeof value === 'number' || typeof value === 'string') {
    return value;
  }
  throw new Error(`Expected ${field} to be a number or string`);
}

/**
 * An id as a Repository filter takes it.
 *
 * Every id here belongs to a `bigInt` column, and a `bigInt` filter accepts a
 * JavaScript number only — a string is rejected outright rather than coerced.
 * Ids reach this plugin as strings often enough (a route parameter, a JSON
 * body, a driver that returns bigints as text) that the conversion is worth
 * one named place. Anything that cannot survive it is refused rather than
 * rounded, because a rounded id silently addresses a different row.
 */
export function asIdFilter(value: WorkflowId): number {
  const id = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(id)) {
    throw new Error(`Workflow identifier "${String(value)}" is out of range.`);
  }
  return id;
}

export function asNullableString(value: unknown): string | null {
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
  store: WorkflowStore,
  id: WorkflowId,
): Promise<WorkflowDefinition | null> {
  const row = await store.workflows.findOne({ filter: { id: asIdFilter(id) } });
  if (!row) {
    return null;
  }
  const nodes = await store.nodes.findMany({
    filter: { workflowId: asIdFilter(id) },
    sort: (sort) => sort.field('id').asc(),
  });
  return hydrateWorkflow(row, nodes.map(hydrateWorkflowNode));
}

export async function loadRun(
  store: WorkflowStore,
  id: WorkflowId,
): Promise<WorkflowRun | null> {
  const row = await store.runs.findOne({ filter: { id: asIdFilter(id) } });
  return row ? hydrateRun(row) : null;
}

export async function loadNodeRun(
  store: WorkflowStore,
  id: WorkflowId,
): Promise<WorkflowNodeRun | null> {
  const row = await store.nodeRuns.findOne({ filter: { id: asIdFilter(id) } });
  return row ? hydrateNodeRun(row) : null;
}
