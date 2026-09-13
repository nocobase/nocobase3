import {
  createDatabaseManager,
  type BuilderExecOptions,
  type BuilderResult,
  type CollectionBuilder,
  type DatabaseManager,
  type Row,
} from '@nocobase/db';

import type {
  JsonObject,
  WorkflowDefinition,
  WorkflowId,
  WorkflowNodeRun,
  WorkflowRun,
} from '../server/engine/types.js';
import {
  asId,
  asIdFilter,
  loadRun,
  loadWorkflow,
  nowInstant,
  serializeJson,
} from '../server/engine/utils.js';
import {
  workflowCollectionSchemas,
  workflowStore,
  type WorkflowStore,
} from '../server/collections/index.js';

export async function createWorkflowCollections(
  builder: CollectionBuilder,
  options: BuilderExecOptions = {},
): Promise<BuilderResult> {
  return builder.createCollections(
    workflowCollectionSchemas.map(({ name, define }) => ({
      name,
      definition: define,
    })),
    options,
  );
}

export type TestNodeInput = {
  key: string;
  type: string;
  config?: JsonObject;
  upstreamKey?: string | null;
  downstreamKey?: string | null;
  branchKey?: string | null;
};

export type TestWorkflowInput = {
  key: string;
  enabled?: boolean;
  options?: JsonObject;
  nodes: TestNodeInput[];
};

export async function createTestDatabase(): Promise<DatabaseManager> {
  const database = createDatabaseManager({
    connections: {
      main: { dialect: 'sqlite', filename: ':memory:' },
    },
  });
  await createWorkflowCollections(database.builder());
  return database;
}

/** A row a test knows must exist; `findOne` returns `undefined` rather than throwing. */
export async function requireRow(
  row: Promise<Row | undefined>,
  description: string,
): Promise<Row> {
  const found = await row;
  if (!found) {
    throw new Error(`${description} was not found`);
  }
  return found;
}

/** The workflow collections of a test database, the way the plugin reaches them. */
export function testStore(database: DatabaseManager): WorkflowStore {
  return workflowStore(database);
}

export async function createTestWorkflow(
  database: DatabaseManager,
  input: TestWorkflowInput,
): Promise<WorkflowDefinition> {
  const store = testStore(database);
  const created = await store.workflows.createOne({
    values: {
      key: input.key,
      title: input.key,
      enabled: input.enabled ?? true,
      current: true,
      inputSchema: serializeJson({ type: 'object' }),
      parametersSchema: serializeJson({}),
      parameterValues: serializeJson({}),
      options: serializeJson(input.options ?? {}),
    },
    select: (select) => select.fields('id'),
  });
  const workflowId = asId(created.record.id);

  const [firstNode, ...otherNodes] = input.nodes.map((node) => ({
    workflowId: asIdFilter(workflowId),
    key: node.key,
    title: node.key,
    type: node.type,
    config: serializeJson(node.config ?? {}),
    options: serializeJson({}),
    upstreamKey: node.upstreamKey ?? null,
    downstreamKey: node.downstreamKey ?? null,
    branchKey: node.branchKey ?? null,
  }));
  if (firstNode) {
    await store.nodes.createMany({ values: [firstNode, ...otherNodes] });
  }

  const workflow = await loadWorkflow(store, workflowId);
  if (!workflow) {
    throw new Error(`Failed to load workflow "${input.key}"`);
  }
  return workflow;
}

export async function findRun(
  database: DatabaseManager,
  eventKey: string,
): Promise<Row> {
  const row = await testStore(database).runs.findOne({ filter: { eventKey } });
  if (!row) {
    throw new Error(`Run "${eventKey}" was not found`);
  }
  return row;
}

export async function listNodeRuns(
  database: DatabaseManager,
  runId: WorkflowId,
): Promise<
  Array<
    Pick<WorkflowNodeRun, 'nodeKey' | 'status' | 'result'> & { error?: string }
  >
> {
  const rows = await testStore(database).nodeRuns.findMany({
    filter: { workflowRunId: asIdFilter(runId) },
    select: (select) => select.fields('nodeKey', 'status', 'result', 'error'),
    sort: (sort) => sort.field('id').asc(),
  });
  return rows.map((row) => ({
    nodeKey: String(row.nodeKey),
    status: Number(row.status),
    result:
      typeof row.result === 'string' ? JSON.parse(row.result) : row.result,
    ...(row.error == null ? {} : { error: String(row.error) }),
  }));
}

export type TestRunInput = {
  workflowId: WorkflowId;
  workflowKey: string;
  eventKey: string;
  status?: number | null;
  dispatched?: boolean;
  startedAt?: string | null;
  expiresAt?: string | null;
  createdAt?: string;
  input?: unknown;
  hash?: string | null;
};

/** Inserts a run row directly, which is how a test stages "what a crashed process left behind". */
export async function insertTestRun(
  database: DatabaseManager,
  input: TestRunInput,
): Promise<WorkflowId> {
  const created = await testStore(database).runs.createOne({
    values: {
      workflowId: asIdFilter(input.workflowId),
      workflowKey: input.workflowKey,
      hash: input.hash ?? null,
      eventKey: input.eventKey,
      input: serializeJson(input.input ?? {}),
      parameters: serializeJson({}),
      status: input.status ?? null,
      dispatched: input.dispatched ?? false,
      stack: serializeJson([]),
      output: serializeJson(null),
      startedAt: input.startedAt ?? null,
      expiresAt: input.expiresAt ?? null,
      createdAt: input.createdAt ?? nowInstant(),
      manually: false,
    },
    select: (select) => select.fields('id'),
  });
  return asId(created.record.id);
}

/** Reads a run hydrated the way the engine sees it, so JSON columns are values and not text. */
export async function readRun(
  database: DatabaseManager,
  id: WorkflowId,
): Promise<WorkflowRun> {
  const run = await loadRun(testStore(database), id);
  if (!run) {
    throw new Error(`Run "${id}" was not found`);
  }
  return run;
}

/** Node keys of a run's node runs, in insertion order — the shape most path assertions want. */
export async function jobTrace(
  database: DatabaseManager,
  runId: WorkflowId,
): Promise<string[]> {
  const nodeRuns = await listNodeRuns(database, runId);
  return nodeRuns.map((nodeRun) => nodeRun.nodeKey);
}

export async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  timeoutMs = 5000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Timed out waiting for a condition');
}
