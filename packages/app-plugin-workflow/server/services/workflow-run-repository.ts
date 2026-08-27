import { randomUUID } from 'node:crypto';
import type { DatabaseManager, Row, SelectQuery } from '@nocobase/app-database';
import { WORKFLOW_COLLECTIONS } from '../collections/index.js';
import {
  loadWorkflow,
  type JsonObject,
  type WorkflowEventOptions,
  type WorkflowId,
  type WorkflowTriggerReceipt,
} from '../engine/index.js';
import type { AppWorkflowRuntime } from '../runtime/runtime.js';
import { triggerWorkflowDefinition } from '../runtime/runtime.js';
import { BadRequestError } from './errors.js';
import {
  normalizePage,
  parsePayload,
  requireJsonObject,
  toRunItem,
} from './mappers.js';
import {
  asWorkflowId,
  redactLog,
  redactPayload,
  toNodeRunSummary,
} from './mappers.js';
import { WorkflowRepository } from './workflow-repository.js';
import type {
  WorkflowPage,
  WorkflowNodeRunPayload,
  WorkflowNodeRunSummary,
  WorkflowRunDetail,
  WorkflowRunListItem,
  WorkflowRunListOptions,
} from './types.js';

export class WorkflowRunRepository {
  private readonly repository: WorkflowRepository;

  constructor(
    private readonly database: DatabaseManager,
    private readonly runtime: AppWorkflowRuntime,
  ) {
    this.repository = new WorkflowRepository(database, runtime);
  }

  async list(
    options: WorkflowRunListOptions = {},
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

  async listForWorkflow(id: WorkflowId): Promise<WorkflowRunListItem[]> {
    const workflow = await this.repository.get(id);
    return (await this.list({ workflowKey: workflow.key, pageSize: 50 })).data;
  }

  async get(id: WorkflowId): Promise<WorkflowRunDetail> {
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
    return {
      ...toRunItem(row),
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

  async trigger(
    workflowKey: string,
    context: JsonObject,
    options: WorkflowEventOptions = {},
  ): Promise<WorkflowTriggerReceipt> {
    return this.runtime.trigger(workflowKey, context, options);
  }

  async nodeRuns(
    runId: WorkflowId,
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
      .where('workflowRunId', '=', runId)
      .orderBy('id');
    if (nodeKey !== undefined) query = query.where('nodeKey', '=', nodeKey);
    return (await query.execute<Row>()).map(toNodeRunSummary);
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
    const result = truncate(redactPayload(parsePayload(row.result)), limit);
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

  async run(
    id: WorkflowId,
    context: unknown,
    options: WorkflowEventOptions = {},
  ): Promise<WorkflowRunListItem> {
    const workflow = await loadWorkflow(this.database.query(), id);
    if (!workflow)
      throw new BadRequestError(`Workflow ${String(id)} was not found.`);
    const eventKey = options.eventKey ?? randomUUID();
    const existing = await this.database
      .query()
      .selectFrom(WORKFLOW_COLLECTIONS.runs)
      .selectAll()
      .where('eventKey', '=', eventKey)
      .executeTakeFirst<Row>();
    if (existing) return toRunItem(existing);
    await triggerWorkflowDefinition(
      this.runtime,
      workflow,
      requireJsonObject(context),
      {
        ...options,
        eventKey,
        manually: true,
      },
    );
    return this.findRun(
      eventKey,
      workflow.key,
      workflow.title,
      workflow.version,
    );
  }

  private async findRun(
    eventKey: string,
    workflowKey: string,
    workflowTitle: string | null = null,
    workflowVersion: string | null = null,
  ): Promise<WorkflowRunListItem> {
    const row = await this.database
      .query()
      .selectFrom(WORKFLOW_COLLECTIONS.runs)
      .selectAll()
      .where('eventKey', '=', eventKey)
      .executeTakeFirst<Row>();
    if (!row)
      throw new Error(`Workflow run for ${workflowKey} was not persisted.`);
    return toRunItem(row, workflowTitle, workflowVersion);
  }

  private async latestNodeRuns(
    runId: WorkflowId,
  ): Promise<WorkflowNodeRunSummary[]> {
    const latestIds = await this.database
      .query()
      .selectFrom(WORKFLOW_COLLECTIONS.nodeRuns)
      .select((eb) => [eb.fn.max<WorkflowId>('id').as('id')])
      .where('workflowRunId', '=', runId)
      .groupBy('nodeKey')
      .execute<Row>();
    const ids = latestIds.map((row) => asWorkflowId(row.id));
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
}

function truncate(
  value: unknown,
  limit: number,
): { value: unknown; truncated: boolean } {
  const text = JSON.stringify(value);
  return text.length > limit
    ? { value: `${text.slice(0, limit)}…`, truncated: true }
    : { value, truncated: false };
}
