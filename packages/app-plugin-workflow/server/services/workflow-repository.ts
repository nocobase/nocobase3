import type {
  DatabaseManager,
  QueryAdapter,
  Row,
} from '@nocobase/app-database';
import { WORKFLOW_COLLECTIONS } from '../collections/index.js';
import {
  loadWorkflow,
  normalizeWorkflowInputValues,
  type WorkflowId,
  type WorkflowInputValues,
} from '../engine/index.js';
import { activateWorkflowSource } from '../loader/index.js';
import type { AppWorkflowRuntime } from '../runtime/runtime.js';
import { BadRequestError, ConflictError } from './errors.js';
import {
  asWorkflowId,
  normalizePage,
  toDiscoveredWorkflowDefinition,
  toWorkflowDefinitionView,
  toWorkflowListItem,
} from './mappers.js';
import type {
  WorkflowDefinitionView,
  WorkflowInputSettings,
  WorkflowListItem,
  WorkflowListOptions,
  WorkflowPage,
} from './types.js';

export class WorkflowRepository {
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
        if (!selected)
          throw new BadRequestError(`Workflow ${String(id)} was not found.`);
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

  async get(id: WorkflowId): Promise<WorkflowDefinitionView> {
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
    const workflow = await this.get(id);
    const rows = await this.database
      .query()
      .selectFrom(WORKFLOW_COLLECTIONS.workflows)
      .selectAll()
      .where('key', '=', workflow.key)
      .orderBy('id', 'desc')
      .execute<Row>();
    const result: WorkflowDefinitionView[] = [];
    for (const row of rows) {
      const revision = await loadWorkflow(
        this.database.query(),
        asWorkflowId(row.id),
      );
      if (revision)
        result.push({
          ...toWorkflowDefinitionView(revision),
          executed: workflow.executed,
          latestRun: workflow.latestRun,
        });
    }
    return result;
  }

  private async setCurrentEnabled(
    id: WorkflowId,
    enabled: boolean,
  ): Promise<WorkflowListItem> {
    const current = await this.database
      .query()
      .selectFrom(WORKFLOW_COLLECTIONS.workflows)
      .select(['id', 'key'])
      .where('id', '=', id)
      .where('current', '=', true)
      .executeTakeFirst<Row>();
    if (!current)
      throw new BadRequestError(
        `Current workflow ${String(id)} was not found.`,
      );
    await this.database.transaction(async (connection) => {
      await connection.query
        .updateTable(WORKFLOW_COLLECTIONS.workflows)
        .set({ enabled: false })
        .where('key', '=', String(current.key))
        .execute();
      if (enabled)
        await connection.query
          .updateTable(WORKFLOW_COLLECTIONS.workflows)
          .set({ enabled: true, current: true })
          .where('id', '=', id)
          .where('current', '=', true)
          .execute();
    });
    const row = await this.database
      .query()
      .selectFrom(WORKFLOW_COLLECTIONS.workflows)
      .select(['id', 'key', 'title', 'enabled', 'current', 'inputSchema'])
      .where('id', '=', id)
      .where('current', '=', true)
      .executeTakeFirst<Row>();
    if (!row)
      throw new BadRequestError(
        `Current workflow ${String(id)} was not found.`,
      );
    return toWorkflowListItem(
      row,
      await this.getExecutedCount(String(row.key)),
    );
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

  async getExecutedCount(
    key: string,
    query: QueryAdapter = this.database.query(),
  ): Promise<number> {
    const executed = await query
      .selectFrom(WORKFLOW_COLLECTIONS.stats)
      .where('key', '=', key)
      .value('executed');
    return Number(executed ?? 0);
  }

  async findCurrentRow(idOrKey: WorkflowId): Promise<Row | undefined> {
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

  async loadCurrentWorkflow(
    id: WorkflowId,
  ): Promise<NonNullable<Awaited<ReturnType<typeof loadWorkflow>>>> {
    const isCurrent = await this.database
      .query()
      .selectFrom(WORKFLOW_COLLECTIONS.workflows)
      .where('id', '=', id)
      .where('current', '=', true)
      .value('id');
    if (isCurrent == null)
      throw new BadRequestError(
        `Current workflow ${String(id)} was not found.`,
      );
    const workflow = await loadWorkflow(this.database.query(), id);
    if (!workflow)
      throw new BadRequestError(`Workflow ${String(id)} was not found.`);
    return workflow;
  }
}
