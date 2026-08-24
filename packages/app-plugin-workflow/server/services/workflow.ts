import type { DatabaseManager, Row, SelectQuery } from '@nocobase/database';
import {
  WORKFLOW_COLLECTIONS,
  activateWorkflowSource,
  loadWorkflow,
  normalizeWorkflowInputValues,
  type WorkflowId,
  type WorkflowInputSchema,
  type WorkflowInputValues,
  type WorkflowRun,
  type JsonObject,
  type WorkflowTriggerReceipt,
} from '../../engine/index.js';

import {
  BadRequestError,
  ConflictError,
  ServiceUnavailableError,
} from './errors.js';
import type { AppWorkflowRuntime } from '../workflows/runtime.js';
import {
  getWorkflowArtifactStore,
  getWorkflowEngine,
  triggerAppWorkflow,
} from '../workflows/runtime.js';

export interface WorkflowListItem {
  id: WorkflowId;
  key: string;
  title: string | null;
  enabled: boolean;
  current: boolean | null;
  hasInputs: boolean;
  executed: number;
  version: string | null;
  hash: string | null;
  activeRunCount: number;
  latestRun: { id: string; status: number | null; createdAt: string } | null;
  registered: boolean;
  canEnable: boolean;
  deployedHash: string | null;
  currentHash: string | null;
}

export interface WorkflowRunListItem extends Pick<
  WorkflowRun,
  'id' | 'workflowId' | 'workflowKey' | 'eventKey' | 'status' | 'createdAt'
> {
  workflowTitle: string | null;
  workflowVersion: string | null;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface WorkflowPage<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
}
export interface WorkflowListOptions {
  key?: string;
  query?: string;
  enabled?: boolean;
  page?: number;
  pageSize?: number;
}
export interface WorkflowRunListOptions {
  workflowKey?: string;
  workflowTitle?: string;
  status?: number | null;
  page?: number;
  pageSize?: number;
}
export interface WorkflowRunDetail extends WorkflowRunListItem {
  hash: string | null;
  context: unknown;
  startedAt: string | null;
  finishedAt: string | null;
  manually: boolean;
  reason: string | null;
  nodeRuns: WorkflowNodeRunSummary[];
}
export interface WorkflowNodeRunSummary {
  id: WorkflowId;
  workflowRunId: WorkflowId;
  nodeId: WorkflowId;
  nodeKey: string;
  status: number;
  startedAt: string;
  finishedAt: string | null;
  branchKey: string | null;
}
export interface WorkflowNodeRunPayload {
  id: string;
  result: unknown;
  error: string | null;
  log: string | null;
  truncated: boolean;
}

export interface WorkflowInputSettings {
  id: WorkflowId;
  schema: WorkflowInputSchema;
  values: WorkflowInputValues;
}

export interface WorkflowService {
  list(options?: WorkflowListOptions): Promise<WorkflowPage<WorkflowListItem>>;
  enable(
    id: WorkflowId,
    expectedDeployedHash?: string,
  ): Promise<WorkflowListItem>;
  disable(id: WorkflowId): Promise<WorkflowListItem>;
  setStatus(id: WorkflowId, enabled: boolean): Promise<WorkflowListItem>;
  getInputs(id: WorkflowId): Promise<WorkflowInputSettings>;
  updateInputs(id: WorkflowId, values: unknown): Promise<WorkflowInputSettings>;
  runs(
    options?: WorkflowRunListOptions,
  ): Promise<WorkflowPage<WorkflowRunListItem>>;
  runsForWorkflow(id: WorkflowId): Promise<WorkflowRunListItem[]>;
  getWorkflow(id: WorkflowId): Promise<WorkflowDefinitionView>;
  revisions(id: WorkflowId): Promise<WorkflowDefinitionView[]>;
  getRun(id: WorkflowId): Promise<WorkflowRunDetail>;
  nodeRuns(id: WorkflowId, nodeKey?: string): Promise<WorkflowNodeRunSummary[]>;
  nodeRunPayload(
    runId: WorkflowId,
    nodeRunId: WorkflowId,
  ): Promise<WorkflowNodeRunPayload>;
  /** Trigger a workflow from application business logic. */
  trigger(
    workflowKey: string,
    context: JsonObject,
    options?: import('../../engine/index.js').WorkflowTriggerOptions,
  ): Promise<WorkflowTriggerReceipt>;
  /** Manually execute any workflow, independently of its configured trigger type. */
  run(
    id: WorkflowId,
    context: unknown,
    idempotencyKey?: string,
  ): Promise<WorkflowRunListItem>;
}

export interface WorkflowDefinitionView {
  id: string;
  key: string;
  title: string | null;
  description: string | null;
  hash: string | null;
  version: string | null;
  enabled: boolean;
  current: boolean | null;
  executed: number;
  latestRun: { id: string; status: number | null; createdAt: string } | null;
  contextSchema: unknown;
  inputSchema: WorkflowInputSchema;
  inputValues: WorkflowInputValues;
  nodes: Array<{
    id: string;
    key: string;
    title: string | null;
    description: string | null;
    type: string;
    config: JsonObject;
    upstreamKey: string | null;
    downstreamKey: string | null;
    branchKey: string | null;
  }>;
}

export class DatabaseWorkflowService implements WorkflowService {
  constructor(
    private readonly database: DatabaseManager,
    private readonly runtime: AppWorkflowRuntime,
  ) {}

  async list(
    options: WorkflowListOptions = {},
  ): Promise<WorkflowPage<WorkflowListItem>> {
    const { page, pageSize, offset } = normalizePage(options);
    const [rows, statRows, runRows, deployed] = await Promise.all([
      this.database
        .query()
        .selectFrom(WORKFLOW_COLLECTIONS.workflows)
        .select([
          'id',
          'key',
          'title',
          'enabled',
          'current',
          'inputSchema',
          'version',
          'hash',
        ])
        .where('current', '=', true)
        .orderBy('id', 'desc')
        .execute<Row>(),
      this.database
        .query()
        .selectFrom(WORKFLOW_COLLECTIONS.stats)
        .select(['key', 'executed'])
        .execute<Row>(),
      this.database
        .query()
        .selectFrom(WORKFLOW_COLLECTIONS.runs)
        .select(['id', 'workflowKey', 'status', 'createdAt'])
        .orderBy('id', 'desc')
        .execute<Row>(),
      this.runtime.discoverArtifacts(),
    ]);
    const executedByKey = new Map(
      statRows.map((row) => [String(row.key), Number(row.executed ?? 0)]),
    );
    const activeByKey = new Map<string, number>();
    const latestByKey = new Map<string, Row>();
    for (const run of runRows) {
      const key = String(run.workflowKey);
      if (!latestByKey.has(key)) latestByKey.set(key, run);
      if (run.status == null || Number(run.status) === 0)
        activeByKey.set(key, (activeByKey.get(key) ?? 0) + 1);
    }
    const deployedByKey = new Map(
      deployed.map((artifact) => [artifact.key, artifact]),
    );
    const items = rows.map((row) => {
      const key = String(row.key);
      const item = toWorkflowListItem(
        row,
        executedByKey.get(key) ?? 0,
        activeByKey.get(key) ?? 0,
        latestByKey.get(key),
      );
      const artifact = deployedByKey.get(key);
      deployedByKey.delete(key);
      return {
        ...item,
        deployedHash: artifact?.digest ?? null,
        currentHash: item.hash,
      };
    });
    for (const artifact of deployedByKey.values()) {
      items.push({
        id: artifact.key,
        key: artifact.key,
        title: artifact.workflow.title ?? null,
        enabled: false,
        current: null,
        hasInputs: Object.keys(artifact.workflow.inputs ?? {}).length > 0,
        executed: 0,
        version: null,
        hash: null,
        activeRunCount: 0,
        latestRun: null,
        registered: false,
        canEnable: true,
        deployedHash: artifact.digest,
        currentHash: null,
      });
    }
    const query = options.query?.toLowerCase();
    const filtered = items.filter(
      (item) =>
        (!options.key || item.key === options.key) &&
        (!query ||
          item.key.toLowerCase().includes(query) ||
          item.title?.toLowerCase().includes(query)) &&
        (options.enabled === undefined || item.enabled === options.enabled),
    );
    return {
      data: filtered.slice(offset, offset + pageSize),
      page,
      pageSize,
      total: filtered.length,
    };
  }

  async enable(
    id: WorkflowId,
    expectedDeployedHash?: string,
  ): Promise<WorkflowListItem> {
    const existing = await this.findCurrentRow(id);
    const key = existing ? String(existing.key) : String(id);
    const deployed = (await this.runtime.discoverArtifacts()).find(
      (artifact) => artifact.key === key,
    );
    if (
      expectedDeployedHash !== undefined &&
      deployed?.digest !== expectedDeployedHash
    )
      throw new ConflictError('deployment-changed');
    if (!existing) {
      if (!deployed)
        throw new BadRequestError(`Workflow ${String(id)} was not found.`);
      if (expectedDeployedHash === undefined)
        throw new BadRequestError('deployedHash is required.');
      await this.runtime.publishArtifact(key, 'enable');
      const created = await this.findCurrentRow(key);
      if (!created) throw new BadRequestError(`Workflow ${key} was not found.`);
      return this.listItemFromRow(created);
    }
    if (deployed) await this.runtime.publishArtifact(key, 'enable');
    const current = await this.findCurrentRow(key);
    if (!current) throw new BadRequestError(`Workflow ${key} was not found.`);
    id = current.id as WorkflowId;
    const workflow = await this.database.transaction(
      async (connection): Promise<WorkflowListItem> => {
        const selected = await connection.query
          .selectFrom(WORKFLOW_COLLECTIONS.workflows)
          .select(['id', 'key', 'title', 'enabled', 'current', 'inputSchema'])
          .where('id', '=', id)
          .executeTakeFirst<Row>();
        if (!selected) {
          throw new BadRequestError(`Workflow ${String(id)} was not found.`);
        }
        await activateWorkflowSource(connection.query, id);
        await connection.query
          .updateTable(WORKFLOW_COLLECTIONS.workflows)
          .set({ enabled: true })
          .where('id', '=', id)
          .execute();
        return toWorkflowListItem(
          { ...selected, enabled: true, current: true },
          await this.getExecutedCount(String(selected.key), connection.query),
        );
      },
    );
    await this.runtime.refreshSourceResolvers();
    return workflow;
  }

  async disable(id: WorkflowId): Promise<WorkflowListItem> {
    return this.setCurrentEnabled(id, false);
  }

  async setStatus(id: WorkflowId, enabled: boolean): Promise<WorkflowListItem> {
    const result = await this.setCurrentEnabled(id, enabled);
    await this.runtime.refreshSourceResolvers();
    return result;
  }

  async getInputs(id: WorkflowId): Promise<WorkflowInputSettings> {
    const workflow = await this.loadCurrentWorkflow(id);
    return {
      id: workflow.id,
      schema: workflow.inputSchema,
      values: workflow.inputValues,
    };
  }

  async updateInputs(
    id: WorkflowId,
    values: unknown,
  ): Promise<WorkflowInputSettings> {
    const workflow = await this.loadCurrentWorkflow(id);
    let normalized: WorkflowInputValues;
    try {
      normalized = normalizeWorkflowInputValues(workflow.inputSchema, values);
    } catch (error) {
      throw new BadRequestError(
        error instanceof Error ? error.message : String(error),
      );
    }
    await this.database
      .query()
      .updateTable(WORKFLOW_COLLECTIONS.workflows)
      .set({ inputValues: JSON.stringify(normalized) })
      .where('id', '=', id)
      .where('current', '=', true)
      .execute();
    return {
      id: workflow.id,
      schema: workflow.inputSchema,
      values: normalized,
    };
  }

  async runs(
    options: WorkflowRunListOptions = {},
  ): Promise<WorkflowPage<WorkflowRunListItem>> {
    return this.listRuns(options);
  }

  async runsForWorkflow(id: WorkflowId): Promise<WorkflowRunListItem[]> {
    const workflow = await this.loadCurrentWorkflow(id);
    return (await this.listRuns({ workflowKey: workflow.key, pageSize: 50 }))
      .data;
  }

  async getWorkflow(id: WorkflowId): Promise<WorkflowDefinitionView> {
    const workflow = await loadWorkflow(this.database.query(), id);
    if (!workflow) {
      const artifact = (await this.runtime.discoverArtifacts()).find(
        (candidate) => candidate.key === String(id),
      );
      if (!artifact)
        throw new BadRequestError(`Workflow ${String(id)} was not found.`);
      return toDiscoveredWorkflowDefinition(artifact);
    }
    const summary = (await this.list({ key: workflow.key, pageSize: 1 }))
      .data[0];
    return {
      ...toWorkflowDefinitionView(workflow),
      executed: summary?.executed ?? 0,
      latestRun: summary?.latestRun ?? null,
    };
  }

  async revisions(id: WorkflowId): Promise<WorkflowDefinitionView[]> {
    const workflow = await this.getWorkflow(id);
    const rows = await this.database
      .query()
      .selectFrom(WORKFLOW_COLLECTIONS.workflows)
      .selectAll()
      .where('key', '=', workflow.key)
      .orderBy('id', 'desc')
      .execute<Row>();
    const result: WorkflowDefinitionView[] = [];
    for (const row of rows) {
      const revision = await loadWorkflow(this.database.query(), asId(row.id));
      if (revision)
        result.push({
          ...toWorkflowDefinitionView(revision),
          executed: workflow.executed,
          latestRun: workflow.latestRun,
        });
    }
    return result;
  }

  async getRun(id: WorkflowId): Promise<WorkflowRunDetail> {
    const [row, nodeRuns] = await Promise.all([
      this.database
        .query()
        .selectFrom(WORKFLOW_COLLECTIONS.runs)
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst<Row>(),
      this.latestNodeRuns(id),
    ]);
    if (!row)
      throw new BadRequestError(`Workflow run ${String(id)} was not found.`);
    const item = toRunItem(row);
    return {
      ...item,
      hash: row.hash == null ? null : String(row.hash),
      context: parsePayload(row.context),
      startedAt: row.startedAt == null ? null : String(row.startedAt),
      finishedAt: row.finishedAt == null ? null : String(row.finishedAt),
      manually:
        row.manually === true || row.manually === 1 || row.manually === '1',
      reason: row.reason == null ? null : String(row.reason),
      nodeRuns,
    };
  }

  async nodeRuns(
    id: WorkflowId,
    nodeKey?: string,
  ): Promise<WorkflowNodeRunSummary[]> {
    let query = this.database
      .query()
      .selectFrom(WORKFLOW_COLLECTIONS.nodeRuns)
      .select([
        'id',
        'workflowRunId',
        'nodeId',
        'nodeKey',
        'status',
        'startedAt',
        'finishedAt',
      ])
      .where('workflowRunId', '=', id)
      .orderBy('id');
    if (nodeKey !== undefined) query = query.where('nodeKey', '=', nodeKey);
    const rows = await query.execute<Row>();
    return rows.map(toNodeRunSummary);
  }

  private async latestNodeRuns(
    id: WorkflowId,
  ): Promise<WorkflowNodeRunSummary[]> {
    const latestIds = await this.database
      .query()
      .selectFrom(WORKFLOW_COLLECTIONS.nodeRuns)
      .select((eb) => [eb.fn.max<WorkflowId>('id').as('id')])
      .where('workflowRunId', '=', id)
      .groupBy('nodeKey')
      .execute<Row>();
    const ids = latestIds.map((row) => asId(row.id));
    if (ids.length === 0) return [];
    const rows = await this.database
      .query()
      .selectFrom(WORKFLOW_COLLECTIONS.nodeRuns)
      .select([
        'id',
        'workflowRunId',
        'nodeId',
        'nodeKey',
        'status',
        'startedAt',
        'finishedAt',
      ])
      .where('id', 'in', ids)
      .orderBy('id')
      .execute<Row>();
    return rows.map(toNodeRunSummary);
  }

  async nodeRunPayload(
    runId: WorkflowId,
    nodeRunId: WorkflowId,
  ): Promise<WorkflowNodeRunPayload> {
    const row = await this.database
      .query()
      .selectFrom(WORKFLOW_COLLECTIONS.nodeRuns)
      .selectAll()
      .where('id', '=', nodeRunId)
      .where('workflowRunId', '=', runId)
      .executeTakeFirst<Row>();
    if (!row)
      throw new BadRequestError(`Node run ${String(nodeRunId)} was not found.`);
    const limit = 64 * 1024;
    const truncate = (
      value: unknown,
    ): { value: unknown; truncated: boolean } => {
      const text = JSON.stringify(value);
      return text.length > limit
        ? { value: `${text.slice(0, limit)}…`, truncated: true }
        : { value, truncated: false };
    };
    const result = truncate(redactPayload(parsePayload(row.result)));
    const error =
      row.error == null ? null : redactLog(String(row.error)).slice(0, limit);
    const log =
      row.log == null ? null : redactLog(String(row.log)).slice(0, limit);
    return {
      id: String(row.id),
      result: result.value,
      error,
      log,
      truncated:
        result.truncated ||
        (row.error != null && String(row.error).length > limit) ||
        (row.log != null && String(row.log).length > limit),
    };
  }

  private async listRuns(
    options: WorkflowRunListOptions,
  ): Promise<WorkflowPage<WorkflowRunListItem>> {
    const { page, pageSize, offset } = normalizePage(options);
    let titleKeys: string[] | undefined;
    if (options.workflowTitle) {
      titleKeys = await this.database
        .query()
        .selectFrom(WORKFLOW_COLLECTIONS.workflows)
        .where('current', '=', true)
        .where('title', 'like', `%${options.workflowTitle}%`)
        .distinct()
        .pluck<string>('key');
      if (titleKeys.length === 0) return { data: [], page, pageSize, total: 0 };
    }
    const applyFilters = (
      query: SelectQuery<Row, Row>,
    ): SelectQuery<Row, Row> => {
      let filtered = query;
      if (options.workflowKey)
        filtered = filtered.where('workflowKey', '=', options.workflowKey);
      if (titleKeys) filtered = filtered.where('workflowKey', 'in', titleKeys);
      if (options.status !== undefined)
        filtered =
          options.status === null
            ? filtered.where('status', 'is', null)
            : filtered.where('status', '=', options.status);
      return filtered;
    };
    const [rows, countRow, workflows] = await Promise.all([
      applyFilters(this.database.query().selectFrom(WORKFLOW_COLLECTIONS.runs))
        .selectAll()
        .orderBy('id', 'desc')
        .limit(pageSize)
        .offset(offset)
        .execute<Row>(),
      applyFilters(this.database.query().selectFrom(WORKFLOW_COLLECTIONS.runs))
        .select(({ fn }) => [fn.countAll().as('total')])
        .executeTakeFirst<{ total: number | string }>(),
      this.database
        .query()
        .selectFrom(WORKFLOW_COLLECTIONS.workflows)
        .select(['id', 'key', 'title', 'version'])
        .execute<Row>(),
    ]);
    const currentTitles = new Map(
      workflows.map((row) => [
        String(row.key),
        row.title == null ? null : String(row.title),
      ]),
    );
    const versions = new Map(
      workflows.map((row) => [
        String(row.id),
        row.version == null ? null : String(row.version),
      ]),
    );
    return {
      data: rows.map((row) =>
        toRunItem(
          row,
          currentTitles.get(String(row.workflowKey)) ?? null,
          versions.get(String(row.workflowId)) ?? null,
        ),
      ),
      page,
      pageSize,
      total: Number(countRow?.total ?? 0),
    };
  }

  async trigger(
    workflowKey: string,
    context: JsonObject,
    options: import('../../engine/index.js').WorkflowTriggerOptions = {},
  ): Promise<WorkflowTriggerReceipt> {
    let current = await this.findCurrentRow(workflowKey);
    if (!current) return { status: 'skipped', reason: 'not-found' };
    if (!current.enabled) return { status: 'skipped', reason: 'disabled' };
    await this.runtime.publishArtifact(workflowKey, 'trigger');
    current = await this.findCurrentRow(workflowKey);
    if (!current) return { status: 'skipped', reason: 'not-found' };
    if (!current.enabled) return { status: 'skipped', reason: 'disabled' };
    const hash = typeof current.hash === 'string' ? current.hash : null;
    const store = getWorkflowArtifactStore(this.runtime);
    if (!hash || !store || !(await store.has(workflowKey, hash)))
      throw new Error(
        `Workflow Artifact ${workflowKey}/${String(hash)} is missing`,
      );
    await this.runtime.start();
    return getWorkflowEngine(this.runtime).trigger(
      workflowKey,
      context,
      options,
    );
  }

  async run(
    id: WorkflowId,
    context: unknown,
    idempotencyKey?: string,
  ): Promise<WorkflowRunListItem> {
    const workflow = await loadWorkflow(this.database.query(), id);
    if (!workflow) {
      throw new BadRequestError(`Workflow ${String(id)} was not found.`);
    }
    const eventKey = idempotencyKey
      ? `manual-${idempotencyKey}`
      : `manual-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const existing = await this.database
      .query()
      .selectFrom(WORKFLOW_COLLECTIONS.runs)
      .selectAll()
      .where('eventKey', '=', eventKey)
      .executeTakeFirst<Row>();
    if (existing) return toRunItem(existing);
    if (!workflow.enabled)
      throw new BadRequestError(`Workflow ${workflow.key} is disabled.`);
    await this.runtime.start();
    await triggerAppWorkflow(
      this.runtime,
      workflow,
      requireJsonObject(context),
      { eventKey, manually: true },
    );
    return this.findRun(eventKey, workflow.key);
  }

  private async setCurrentEnabled(
    id: WorkflowId,
    enabled: boolean,
  ): Promise<WorkflowListItem> {
    const result = await this.database
      .query()
      .updateTable(WORKFLOW_COLLECTIONS.workflows)
      .set({ enabled })
      .where('id', '=', id)
      .where('current', '=', true)
      .execute();
    if (result.updatedCount === 0) {
      throw new BadRequestError(
        `Current workflow ${String(id)} was not found.`,
      );
    }
    const row = await this.database
      .query()
      .selectFrom(WORKFLOW_COLLECTIONS.workflows)
      .select(['id', 'key', 'title', 'enabled', 'current', 'inputSchema'])
      .where('id', '=', id)
      .where('current', '=', true)
      .executeTakeFirst<Row>();
    if (!row) {
      throw new BadRequestError(
        `Current workflow ${String(id)} was not found.`,
      );
    }
    return toWorkflowListItem(
      row,
      await this.getExecutedCount(String(row.key)),
    );
  }

  private async getExecutedCount(
    key: string,
    query = this.database.query(),
  ): Promise<number> {
    const executed = await query
      .selectFrom(WORKFLOW_COLLECTIONS.stats)
      .where('key', '=', key)
      .value('executed');
    return Number(executed ?? 0);
  }

  private async findCurrentRow(idOrKey: WorkflowId): Promise<Row | undefined> {
    const byId = await this.database
      .query()
      .selectFrom(WORKFLOW_COLLECTIONS.workflows)
      .selectAll()
      .where('current', '=', true)
      .where('id', '=', idOrKey)
      .executeTakeFirst<Row>();
    if (byId) return byId;
    return this.database
      .query()
      .selectFrom(WORKFLOW_COLLECTIONS.workflows)
      .selectAll()
      .where('current', '=', true)
      .where('key', '=', String(idOrKey))
      .executeTakeFirst<Row>();
  }

  private async listItemFromRow(row: Row): Promise<WorkflowListItem> {
    const key = String(row.key);
    const deployed = (await this.runtime.discoverArtifacts()).find(
      (artifact) => artifact.key === key,
    );
    return {
      ...toWorkflowListItem(row, await this.getExecutedCount(key)),
      deployedHash: deployed?.digest ?? null,
      currentHash: row.hash == null ? null : String(row.hash),
    };
  }

  private async loadCurrentWorkflow(
    id: WorkflowId,
  ): Promise<NonNullable<Awaited<ReturnType<typeof loadWorkflow>>>> {
    const isCurrent = await this.database
      .query()
      .selectFrom(WORKFLOW_COLLECTIONS.workflows)
      .where('id', '=', id)
      .where('current', '=', true)
      .value('id');
    if (isCurrent == null) {
      throw new BadRequestError(
        `Current workflow ${String(id)} was not found.`,
      );
    }
    const workflow = await loadWorkflow(this.database.query(), id);
    if (!workflow) {
      throw new BadRequestError(`Workflow ${String(id)} was not found.`);
    }
    return workflow;
  }

  private async findRun(
    eventKey: string,
    workflowKey: string,
  ): Promise<WorkflowRunListItem> {
    const row = await this.database
      .query()
      .selectFrom(WORKFLOW_COLLECTIONS.runs)
      .selectAll()
      .where('eventKey', '=', eventKey)
      .executeTakeFirst<Row>();
    if (!row) {
      throw new Error(`Workflow run for ${workflowKey} was not persisted.`);
    }
    return toRunItem(row);
  }
}

function toWorkflowListItem(
  row: Row,
  executed: number,
  activeRunCount: number = 0,
  latestRun?: Row,
): WorkflowListItem {
  return {
    id: String(asId(row.id)),
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

function toDiscoveredWorkflowDefinition(
  artifact: import('../../engine/index.js').WorkflowDistArtifact,
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

function normalizePage(options: { page?: number; pageSize?: number }): {
  page: number;
  pageSize: number;
  offset: number;
} {
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 20));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function hasObjectKeys(value: unknown): boolean {
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      return (
        parsed !== null &&
        typeof parsed === 'object' &&
        !Array.isArray(parsed) &&
        Object.keys(parsed).length > 0
      );
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

function requireJsonObject(value: unknown): JsonObject {
  if (!isJsonObject(value))
    throw new BadRequestError('Workflow context must be a JSON object.');
  return value;
}

function isJsonObject(value: unknown): value is JsonObject {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.values(value).every(isJsonValue)
  );
}

function isJsonValue(
  value: unknown,
): value is import('../../engine/index.js').JsonValue {
  if (value === null || typeof value === 'boolean' || typeof value === 'string')
    return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  return isJsonObject(value);
}

export class UnavailableWorkflowService implements WorkflowService {
  async list(
    _options?: WorkflowListOptions,
  ): Promise<WorkflowPage<WorkflowListItem>> {
    throw new ServiceUnavailableError('Workflow runtime is not configured.');
  }

  async enable(_id: WorkflowId): Promise<WorkflowListItem> {
    throw new ServiceUnavailableError('Workflow runtime is not configured.');
  }

  async disable(_id: WorkflowId): Promise<WorkflowListItem> {
    throw new ServiceUnavailableError('Workflow runtime is not configured.');
  }
  async setStatus(
    _id: WorkflowId,
    _enabled: boolean,
  ): Promise<WorkflowListItem> {
    throw new ServiceUnavailableError('Workflow runtime is not configured.');
  }

  async getInputs(_id: WorkflowId): Promise<WorkflowInputSettings> {
    throw new ServiceUnavailableError('Workflow runtime is not configured.');
  }

  async updateInputs(
    _id: WorkflowId,
    _values: unknown,
  ): Promise<WorkflowInputSettings> {
    throw new ServiceUnavailableError('Workflow runtime is not configured.');
  }

  async runs(
    _options?: WorkflowRunListOptions,
  ): Promise<WorkflowPage<WorkflowRunListItem>> {
    throw new ServiceUnavailableError('Workflow runtime is not configured.');
  }

  async runsForWorkflow(_id: WorkflowId): Promise<WorkflowRunListItem[]> {
    throw new ServiceUnavailableError('Workflow runtime is not configured.');
  }

  async trigger(
    _workflowKey: string,
    _context: JsonObject,
    _options: import('../../engine/index.js').WorkflowTriggerOptions = {},
  ): Promise<WorkflowTriggerReceipt> {
    throw new ServiceUnavailableError('Workflow runtime is not configured.');
  }

  async run(
    _id: WorkflowId,
    _context: unknown,
    _idempotencyKey?: string,
  ): Promise<WorkflowRunListItem> {
    throw new ServiceUnavailableError('Workflow runtime is not configured.');
  }
  async getWorkflow(_id: WorkflowId): Promise<WorkflowDefinitionView> {
    throw new ServiceUnavailableError('Workflow runtime is not configured.');
  }
  async revisions(_id: WorkflowId): Promise<WorkflowDefinitionView[]> {
    throw new ServiceUnavailableError('Workflow runtime is not configured.');
  }
  async getRun(_id: WorkflowId): Promise<WorkflowRunDetail> {
    throw new ServiceUnavailableError('Workflow runtime is not configured.');
  }
  async nodeRuns(
    _id: WorkflowId,
    _nodeKey?: string,
  ): Promise<WorkflowNodeRunSummary[]> {
    throw new ServiceUnavailableError('Workflow runtime is not configured.');
  }
  async nodeRunPayload(
    _runId: WorkflowId,
    _nodeRunId: WorkflowId,
  ): Promise<WorkflowNodeRunPayload> {
    throw new ServiceUnavailableError('Workflow runtime is not configured.');
  }
}

function asId(value: unknown): WorkflowId {
  if (typeof value === 'number' || typeof value === 'string') return value;
  throw new Error('Workflow row has an invalid id.');
}

function toRunItem(
  row: Row,
  workflowTitle: string | null = null,
  workflowVersion: string | null = null,
): WorkflowRunListItem {
  return {
    id: String(asId(row.id)),
    workflowId: String(asId(row.workflowId)),
    workflowKey: String(row.workflowKey ?? ''),
    workflowTitle,
    workflowVersion,
    eventKey: String(row.eventKey ?? ''),
    status: row.status == null ? null : Number(row.status),
    createdAt:
      row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : String(row.createdAt ?? ''),
    startedAt:
      row.startedAt == null
        ? null
        : row.startedAt instanceof Date
          ? row.startedAt.toISOString()
          : String(row.startedAt),
    finishedAt:
      row.finishedAt == null
        ? null
        : row.finishedAt instanceof Date
          ? row.finishedAt.toISOString()
          : String(row.finishedAt),
  };
}

function toNodeRunSummary(row: Row): WorkflowNodeRunSummary {
  return {
    id: String(asId(row.id)),
    workflowRunId: String(asId(row.workflowRunId)),
    nodeId: String(asId(row.nodeId)),
    nodeKey: String(row.nodeKey),
    status: Number(row.status),
    startedAt:
      row.startedAt instanceof Date
        ? row.startedAt.toISOString()
        : String(row.startedAt),
    finishedAt:
      row.finishedAt == null
        ? null
        : row.finishedAt instanceof Date
          ? row.finishedAt.toISOString()
          : String(row.finishedAt),
    branchKey: null,
  };
}

function toWorkflowDefinitionView(
  workflow: import('../../engine/index.js').WorkflowDefinition,
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

function parsePayload(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}
function redactPayload(value: unknown): unknown {
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
function redactLog(value: string): string {
  return value.replace(
    /(password|secret|token|authorization|cookie)\s*[:=]\s*[^\s,;]+/gi,
    '$1=[REDACTED]',
  );
}
