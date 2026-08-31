import {
  createDatabaseManager,
  type BuilderExecOptions,
  type BuilderResult,
  type CollectionBuilder,
  type DatabaseManager,
  type Row,
} from '@nocobase/app-database';

import { WORKFLOW_COLLECTIONS } from '../server/collections/names.js';
import type {
  JsonObject,
  WorkflowDefinition,
  WorkflowId,
  WorkflowNodeRun,
  WorkflowRun,
} from '../server/engine/types.js';
import { loadRun, loadWorkflow } from '../server/engine/utils.js';
import { workflowCollectionSchemas } from '../server/collections/index.js';

export async function createWorkflowCollections(
  builder: CollectionBuilder,
  options: BuilderExecOptions = {},
): Promise<BuilderResult[]> {
  const results: BuilderResult[] = [];
  for (const schema of workflowCollectionSchemas) {
    results.push(
      await builder.createCollection(schema.name, schema.define, options),
    );
  }
  return results;
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

export async function createTestWorkflow(
  database: DatabaseManager,
  input: TestWorkflowInput,
): Promise<WorkflowDefinition> {
  await database
    .query()
    .insertInto(WORKFLOW_COLLECTIONS.workflows)
    .values({
      key: input.key,
      title: input.key,
      enabled: input.enabled ?? true,
      current: true,
      inputSchema: JSON.stringify({ type: 'object' }),
      parametersSchema: JSON.stringify({}),
      parameterValues: JSON.stringify({}),
      options: JSON.stringify(input.options ?? {}),
    })
    .execute();
  const workflowId = await database
    .query()
    .selectFrom(WORKFLOW_COLLECTIONS.workflows)
    .where('key', '=', input.key)
    .value<WorkflowId>('id');
  if (workflowId == null) {
    throw new Error(`Failed to insert workflow "${input.key}"`);
  }

  if (input.nodes.length) {
    await database
      .query()
      .insertInto(WORKFLOW_COLLECTIONS.nodes)
      .values(
        input.nodes.map((node) => ({
          workflowId,
          key: node.key,
          title: node.key,
          type: node.type,
          config: JSON.stringify(node.config ?? {}),
          options: JSON.stringify({}),
          upstreamKey: node.upstreamKey ?? null,
          downstreamKey: node.downstreamKey ?? null,
          branchKey: node.branchKey ?? null,
        })),
      )
      .execute();
  }

  const workflow = await loadWorkflow(database.query(), workflowId);
  if (!workflow) {
    throw new Error(`Failed to load workflow "${input.key}"`);
  }
  return workflow;
}

export async function findRun(
  database: DatabaseManager,
  eventKey: string,
): Promise<Row> {
  return database
    .query()
    .selectFrom(WORKFLOW_COLLECTIONS.runs)
    .selectAll()
    .where('eventKey', '=', eventKey)
    .executeTakeFirstOrThrow<Row>();
}

export async function listNodeRuns(
  database: DatabaseManager,
  runId: WorkflowId,
): Promise<
  Array<
    Pick<WorkflowNodeRun, 'nodeKey' | 'status' | 'result'> & { error?: string }
  >
> {
  const rows = await database
    .query()
    .selectFrom(WORKFLOW_COLLECTIONS.nodeRuns)
    .select(['nodeKey', 'status', 'result', 'error'])
    .where('workflowRunId', '=', runId)
    .orderBy('id')
    .execute<Row>();
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
  await database
    .query()
    .insertInto(WORKFLOW_COLLECTIONS.runs)
    .values({
      workflowId: input.workflowId,
      workflowKey: input.workflowKey,
      hash: input.hash ?? null,
      eventKey: input.eventKey,
      input: JSON.stringify(input.input ?? {}),
      parameters: JSON.stringify({}),
      status: input.status ?? null,
      dispatched: input.dispatched ?? false,
      stack: JSON.stringify([]),
      output: JSON.stringify(null),
      startedAt: input.startedAt ?? null,
      expiresAt: input.expiresAt ?? null,
      createdAt: input.createdAt ?? new Date().toISOString(),
      manually: false,
    })
    .execute();
  const id = await database
    .query()
    .selectFrom(WORKFLOW_COLLECTIONS.runs)
    .where('eventKey', '=', input.eventKey)
    .value<WorkflowId>('id');
  if (id == null) {
    throw new Error(`Failed to insert run "${input.eventKey}"`);
  }
  return id;
}

/** Reads a run hydrated the way the engine sees it, so JSON columns are values and not text. */
export async function readRun(
  database: DatabaseManager,
  id: WorkflowId,
): Promise<WorkflowRun> {
  const run = await loadRun(database.query(), id);
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
