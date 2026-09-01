import type {
  DatabaseManager,
  Expression,
  ExpressionBuilder,
  QueryAdapter,
  Row,
  SelectQuery,
  SqlBool,
} from '@nocobase/db';
import { WORKFLOW_COLLECTIONS } from '../collections/index.js';
import {
  loadWorkflow,
  normalizeWorkflowParameterValues,
  type WorkflowId,
  type WorkflowParameterValues,
} from '../engine/index.js';
import {
  activateWorkflowSource,
  type WorkflowDistArtifact,
} from '../loader/index.js';
import type { WorkflowServiceApi } from '../runtime/runtime.js';
import { BadRequestError } from '../errors.js';
import {
  asWorkflowId,
  normalizePage,
  toDiscoveredWorkflowDefinition,
  toWorkflowDefinitionView,
  toWorkflowListItem,
} from './mappers.js';
import type {
  WorkflowDefinitionView,
  WorkflowParameterSettings,
  WorkflowListItem,
  WorkflowListOptions,
  WorkflowPage,
} from './types.js';

export class WorkflowRepository {
  constructor(
    private readonly database: DatabaseManager,
    private readonly service: WorkflowServiceApi,
  ) {}

  async list(
    options: WorkflowListOptions = {},
  ): Promise<WorkflowPage<WorkflowListItem>> {
    const { page, pageSize, offset } = normalizePage(options);
    const deployed = await this.service.discoverArtifacts();
    const deployedByKey = new Map(
      deployed.map((artifact) => [artifact.key, artifact]),
    );
    const deployedRows =
      deployed.length === 0
        ? []
        : await this.database
            .query()
            .selectFrom(WORKFLOW_COLLECTIONS.workflows)
            .select(['id', 'key', 'hash'])
            .where('current', '=', true)
            .where(
              'key',
              'in',
              deployed.map((artifact) => artifact.key),
            )
            .execute<Row>();
    const deployedRowByKey = new Map(
      deployedRows.map((row) => [String(row.key), row]),
    );
    const overriddenKeys = deployed
      .filter((artifact) => {
        const row = deployedRowByKey.get(artifact.key);
        return row && row.hash !== artifact.digest;
      })
      .map((artifact) => artifact.key);
    const matchingOverriddenKeys = overriddenKeys.filter((key) => {
      const artifact = deployedByKey.get(key);
      return artifact
        ? this.artifactMatchesListOptions(artifact, options)
        : false;
    });
    const applyFilters = (
      query: SelectQuery<Row, Row>,
    ): SelectQuery<Row, Row> => {
      let filtered = query.where('current', '=', true);
      if (overriddenKeys.length > 0) {
        filtered = filtered.where((eb) =>
          eb.or([
            ...(matchingOverriddenKeys.length > 0
              ? [eb('key', 'in', matchingOverriddenKeys)]
              : []),
            eb.and([
              eb('key', 'not in', overriddenKeys),
              ...this.workflowFilterExpressions(eb, options),
            ]),
          ]),
        );
      } else {
        if (options.key || options.query || options.enabled !== undefined)
          filtered = filtered.where((eb) =>
            eb.and(this.workflowFilterExpressions(eb, options)),
          );
      }
      return filtered;
    };
    const novelArtifacts = deployed.filter(
      (artifact) =>
        !deployedRowByKey.has(artifact.key) &&
        this.artifactMatchesListOptions(artifact, options),
    );
    const countRow = await applyFilters(
      this.database.query().selectFrom(WORKFLOW_COLLECTIONS.workflows),
    )
      .select(({ fn }) => [fn.countAll().as('total')])
      .executeTakeFirst<{ total: number | string }>();
    const databaseTotal = Number(countRow?.total ?? 0);
    const databasePageSize = Math.max(
      0,
      Math.min(pageSize, databaseTotal - offset),
    );
    const rows =
      databasePageSize === 0
        ? []
        : await applyFilters(
            this.database.query().selectFrom(WORKFLOW_COLLECTIONS.workflows),
          )
            .select([
              'id',
              'key',
              'title',
              'enabled',
              'current',
              'parametersSchema',
              'version',
              'hash',
            ])
            .orderBy('id', 'desc')
            .limit(databasePageSize)
            .offset(offset)
            .execute<Row>();
    const rowKeys = rows.map((row) => String(row.key));
    const [statRows, activeRows, latestIdRows] =
      rowKeys.length === 0
        ? [[], [], []]
        : await Promise.all([
            this.database
              .query()
              .selectFrom(WORKFLOW_COLLECTIONS.stats)
              .select(['key', 'executed'])
              .where('key', 'in', rowKeys)
              .execute<Row>(),
            this.database
              .query()
              .selectFrom(WORKFLOW_COLLECTIONS.runs)
              .select(({ fn }) => [
                'workflowKey',
                fn.countAll().as('activeRunCount'),
              ])
              .where('workflowKey', 'in', rowKeys)
              .where((eb) =>
                eb.or([eb('status', 'is', null), eb('status', '=', 0)]),
              )
              .groupBy('workflowKey')
              .execute<Row>(),
            this.database
              .query()
              .selectFrom(WORKFLOW_COLLECTIONS.runs)
              .select(({ fn }) => ['workflowKey', fn.max('id').as('latestId')])
              .where('workflowKey', 'in', rowKeys)
              .groupBy('workflowKey')
              .execute<Row>(),
          ]);
    const latestIds = latestIdRows.map((row) => row.latestId);
    const latestRows =
      latestIds.length === 0
        ? []
        : await this.database
            .query()
            .selectFrom(WORKFLOW_COLLECTIONS.runs)
            .select(['id', 'workflowKey', 'status', 'createdAt'])
            .where('id', 'in', latestIds)
            .execute<Row>();
    const executedByKey = new Map(
      statRows.map((row) => [String(row.key), Number(row.executed ?? 0)]),
    );
    const activeByKey = new Map(
      activeRows.map((row) => [
        String(row.workflowKey),
        Number(row.activeRunCount ?? 0),
      ]),
    );
    const latestByKey = new Map(
      latestRows.map((row) => [String(row.workflowKey), row]),
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
      if (artifact && artifact.digest !== item.hash) {
        return {
          ...item,
          id: null,
          title: artifact.workflow.title ?? null,
          enabled: false,
          current: null,
          hasParameters:
            Object.keys(artifact.workflow.parameters ?? {}).length > 0,
          version: null,
          hash: artifact.digest,
        };
      }
      return item;
    });
    const novelOffset = Math.max(0, offset - databaseTotal);
    const remaining = pageSize - items.length;
    for (const artifact of novelArtifacts.slice(
      novelOffset,
      novelOffset + remaining,
    )) {
      items.push({
        id: null,
        key: artifact.key,
        title: artifact.workflow.title ?? null,
        enabled: false,
        current: null,
        hasParameters:
          Object.keys(artifact.workflow.parameters ?? {}).length > 0,
        executed: 0,
        version: null,
        hash: artifact.digest,
        activeRunCount: 0,
        latestRun: null,
      });
    }
    return {
      data: items,
      page,
      pageSize,
      total: databaseTotal + novelArtifacts.length,
    };
  }

  private workflowFilterExpressions(
    eb: ExpressionBuilder,
    options: WorkflowListOptions,
  ): Expression<SqlBool>[] {
    const expressions: Expression<SqlBool>[] = [];
    if (options.key) expressions.push(eb('key', '=', options.key));
    if (options.query) {
      const pattern = `%${options.query}%`;
      expressions.push(
        eb.or([eb('key', 'like', pattern), eb('title', 'like', pattern)]),
      );
    }
    if (options.enabled !== undefined)
      expressions.push(eb('enabled', '=', options.enabled));
    return expressions;
  }

  private artifactMatchesListOptions(
    artifact: WorkflowDistArtifact,
    options: WorkflowListOptions,
  ): boolean {
    const query = options.query?.toLowerCase();
    return (
      (!options.key || artifact.key === options.key) &&
      (!query ||
        artifact.key.toLowerCase().includes(query) ||
        artifact.workflow.title?.toLowerCase().includes(query)) &&
      (options.enabled === undefined || options.enabled === false)
    );
  }

  async enable(idOrHash: WorkflowId): Promise<WorkflowListItem> {
    const resolved = await this.resolveRevision(idOrHash);
    const id = resolved.id;
    const workflow = await this.database.transaction(
      async (connection): Promise<WorkflowListItem> => {
        const selected = await connection.query
          .selectFrom(WORKFLOW_COLLECTIONS.workflows)
          .select([
            'id',
            'key',
            'title',
            'enabled',
            'current',
            'parametersSchema',
            'version',
            'hash',
          ])
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
    await this.service.refreshSourceResolvers();
    return workflow;
  }

  async disable(id: WorkflowId): Promise<WorkflowListItem> {
    return this.setCurrentEnabled(id, false);
  }

  async setStatus(id: WorkflowId, enabled: boolean): Promise<WorkflowListItem> {
    const result = await this.setCurrentEnabled(id, enabled);
    await this.service.refreshSourceResolvers();
    return result;
  }

  async getParameters(id: WorkflowId): Promise<WorkflowParameterSettings> {
    const workflow = await this.resolveRevision(id);
    return {
      id: workflow.id,
      schema: workflow.parametersSchema,
      values: workflow.parameterValues,
    };
  }

  async updateParameters(
    id: WorkflowId,
    values: unknown,
  ): Promise<WorkflowParameterSettings> {
    const workflow = await this.resolveRevision(id);
    let normalized: WorkflowParameterValues;
    try {
      normalized = normalizeWorkflowParameterValues(
        workflow.parametersSchema,
        values,
      );
    } catch (error) {
      throw new BadRequestError(
        error instanceof Error ? error.message : String(error),
      );
    }
    await this.database
      .query()
      .updateTable(WORKFLOW_COLLECTIONS.workflows)
      .set({ parameterValues: JSON.stringify(normalized) })
      .where('id', '=', workflow.id)
      .execute();
    return {
      id: workflow.id,
      schema: workflow.parametersSchema,
      values: normalized,
    };
  }

  async get(id: WorkflowId): Promise<WorkflowDefinitionView> {
    let workflow = await loadWorkflow(this.database.query(), id);
    if (!workflow) {
      const materialized = await this.database
        .query()
        .selectFrom(WORKFLOW_COLLECTIONS.workflows)
        .select('id')
        .where('hash', '=', String(id))
        .executeTakeFirst<Row>();
      if (materialized)
        workflow = await loadWorkflow(
          this.database.query(),
          asWorkflowId(materialized.id),
        );
    }
    if (!workflow) {
      const artifact = (await this.service.discoverArtifacts()).find(
        (candidate) => candidate.digest === String(id),
      );
      if (!artifact)
        throw new BadRequestError(`Workflow ${String(id)} was not found.`);
      return toDiscoveredWorkflowDefinition(artifact);
    }
    return {
      ...toWorkflowDefinitionView(workflow),
      executed: await this.getExecutedCount(workflow.key),
      latestRun: null,
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
    const result: WorkflowDefinitionView[] =
      workflow.id === null ? [workflow] : [];
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
      .select(['id', 'key', 'title', 'enabled', 'current', 'parametersSchema'])
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

  async findCurrentRowById(id: WorkflowId): Promise<Row | undefined> {
    return this.database
      .query()
      .selectFrom(WORKFLOW_COLLECTIONS.workflows)
      .selectAll()
      .where('current', '=', true)
      .where('id', '=', id)
      .executeTakeFirst<Row>();
  }

  async findCurrentRowByKey(key: string): Promise<Row | undefined> {
    return this.database
      .query()
      .selectFrom(WORKFLOW_COLLECTIONS.workflows)
      .selectAll()
      .where('current', '=', true)
      .where('key', '=', key)
      .executeTakeFirst<Row>();
  }

  async resolveRevision(
    idOrHash: WorkflowId,
  ): Promise<NonNullable<Awaited<ReturnType<typeof loadWorkflow>>>> {
    let existing = await loadWorkflow(this.database.query(), idOrHash);
    if (!existing) {
      const row = await this.database
        .query()
        .selectFrom(WORKFLOW_COLLECTIONS.workflows)
        .select('id')
        .where('hash', '=', String(idOrHash))
        .executeTakeFirst<Row>();
      if (row)
        existing = await loadWorkflow(
          this.database.query(),
          asWorkflowId(row.id),
        );
    }
    if (existing) {
      if (existing.hash)
        await this.service.ensureArtifactMaterialized(existing.hash);
      return existing;
    }
    const workflowId = await this.service.ensureArtifactMaterialized(
      String(idOrHash),
    );
    if (workflowId == null)
      throw new BadRequestError(
        `Workflow id or hash ${String(idOrHash)} was not found.`,
      );
    const materialized = await loadWorkflow(this.database.query(), workflowId);
    if (!materialized)
      throw new BadRequestError(
        `Materialized workflow ${String(workflowId)} was not found.`,
      );
    return materialized;
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
