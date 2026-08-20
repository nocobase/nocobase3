import type { DatabaseManager, Row } from '@nocobase/database';
import {
  WORKFLOW_COLLECTIONS,
  activateWorkflowSource,
  loadWorkflow,
  normalizeWorkflowInputValues,
  type WorkflowId,
  type WorkflowInputSchema,
  type WorkflowInputValues,
  type WorkflowRun,
} from '@nocobase/workflow';

import { BadRequestError, ServiceUnavailableError } from './errors.js';
import type { AppWorkflowRuntime } from '../workflows/runtime.js';
import { triggerAppWorkflow } from '../workflows/runtime.js';

export interface WorkflowListItem {
  id: WorkflowId;
  key: string;
  title: string | null;
  enabled: boolean;
  type: string;
  current: boolean | null;
  hasInputs: boolean;
  executed: number;
}

export interface WorkflowRunListItem extends Pick<WorkflowRun, 'id' | 'workflowId' | 'workflowKey' | 'eventKey' | 'status' | 'output' | 'createdAt'> {}

export interface WorkflowInputSettings {
  id: WorkflowId;
  schema: WorkflowInputSchema;
  values: WorkflowInputValues;
}

export interface WorkflowService {
  list(): Promise<WorkflowListItem[]>;
  enable(id: WorkflowId): Promise<WorkflowListItem>;
  disable(id: WorkflowId): Promise<WorkflowListItem>;
  getInputs(id: WorkflowId): Promise<WorkflowInputSettings>;
  updateInputs(id: WorkflowId, values: unknown): Promise<WorkflowInputSettings>;
  runs(): Promise<WorkflowRunListItem[]>;
  runsForWorkflow(id: WorkflowId): Promise<WorkflowRunListItem[]>;
  /** Raise a custom event from application business logic. */
  trigger(workflowKey: string, context: unknown): Promise<WorkflowRunListItem>;
  /** Manually execute any workflow, independently of its configured trigger type. */
  run(id: WorkflowId, context: unknown): Promise<WorkflowRunListItem>;
}

export class DatabaseWorkflowService implements WorkflowService {
  constructor(
    private readonly database: DatabaseManager,
    private readonly runtime: AppWorkflowRuntime,
  ) {}

  async list(): Promise<WorkflowListItem[]> {
    const [rows, statRows] = await Promise.all([this.database.query()
      .selectFrom(WORKFLOW_COLLECTIONS.workflows)
      .select(['id', 'key', 'title', 'enabled', 'type', 'current', 'inputSchema'])
      .where('current', '=', true)
      .orderBy('id', 'desc')
      .execute<Row>(), this.database.query()
      .selectFrom(WORKFLOW_COLLECTIONS.stats)
      .select(['key', 'executed'])
      .execute<Row>()]);
    const executedByKey = new Map(statRows.map((row) => [String(row.key), Number(row.executed ?? 0)]));
    return rows.map((row) => toWorkflowListItem(row, executedByKey.get(String(row.key)) ?? 0));
  }

  async enable(id: WorkflowId): Promise<WorkflowListItem> {
    const workflow = await this.database.transaction(async (connection): Promise<WorkflowListItem> => {
      const selected = await connection.query
        .selectFrom(WORKFLOW_COLLECTIONS.workflows)
        .select(['id', 'key', 'title', 'enabled', 'type', 'current', 'inputSchema'])
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
      return toWorkflowListItem({ ...selected, enabled: true, current: true }, await this.getExecutedCount(String(selected.key), connection.query));
    });
    await this.runtime.refreshSourceResolvers();
    return workflow;
  }

  async disable(id: WorkflowId): Promise<WorkflowListItem> {
    return this.setCurrentEnabled(id, false);
  }

  async getInputs(id: WorkflowId): Promise<WorkflowInputSettings> {
    const workflow = await this.loadCurrentWorkflow(id);
    return { id: workflow.id, schema: workflow.inputSchema, values: workflow.inputValues };
  }

  async updateInputs(id: WorkflowId, values: unknown): Promise<WorkflowInputSettings> {
    const workflow = await this.loadCurrentWorkflow(id);
    let normalized: WorkflowInputValues;
    try {
      normalized = normalizeWorkflowInputValues(workflow.inputSchema, values);
    } catch (error) {
      throw new BadRequestError(error instanceof Error ? error.message : String(error));
    }
    await this.database.query()
      .updateTable(WORKFLOW_COLLECTIONS.workflows)
      .set({ inputValues: JSON.stringify(normalized) })
      .where('id', '=', id)
      .where('current', '=', true)
      .execute();
    return { id: workflow.id, schema: workflow.inputSchema, values: normalized };
  }

  async runs(): Promise<WorkflowRunListItem[]> {
    return this.listRuns();
  }

  async runsForWorkflow(id: WorkflowId): Promise<WorkflowRunListItem[]> {
    const workflow = await this.loadCurrentWorkflow(id);
    return this.listRuns(workflow.key);
  }

  private async listRuns(workflowKey?: string): Promise<WorkflowRunListItem[]> {
    let query = this.database.query()
      .selectFrom(WORKFLOW_COLLECTIONS.runs)
      .selectAll()
      .orderBy('id', 'desc');
    if (workflowKey !== undefined) query = query.where('workflowKey', '=', workflowKey);
    const rows = await query.limit(50).execute<Row>();
    return rows.map((row) => toRunItem(row));
  }

  async trigger(workflowKey: string, context: unknown): Promise<WorkflowRunListItem> {
    const workflowId = await this.database.query()
      .selectFrom(WORKFLOW_COLLECTIONS.workflows)
      .where('key', '=', workflowKey)
      .where('current', '=', true)
      .where('type', '=', 'custom')
      .where('enabled', '=', true)
      .value<WorkflowId>('id');
    if (workflowId == null) {
      throw new BadRequestError(`Enabled custom-event workflow "${workflowKey}" was not found.`);
    }
    const workflow = await loadWorkflow(this.database.query(), workflowId);
    if (!workflow) {
      throw new BadRequestError(`Workflow ${String(workflowId)} was not found.`);
    }
    const eventKey = `custom-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await triggerAppWorkflow(this.runtime, workflow, context, { eventKey });
    return this.findRun(eventKey, workflow.key);
  }

  async run(id: WorkflowId, context: unknown): Promise<WorkflowRunListItem> {
    const workflow = await loadWorkflow(this.database.query(), id);
    if (!workflow) {
      throw new BadRequestError(`Workflow ${String(id)} was not found.`);
    }
    const eventKey = `manual-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await triggerAppWorkflow(this.runtime, workflow, context, { eventKey, manually: true });
    return this.findRun(eventKey, workflow.key);
  }

  private async setCurrentEnabled(id: WorkflowId, enabled: boolean): Promise<WorkflowListItem> {
    const result = await this.database.query()
      .updateTable(WORKFLOW_COLLECTIONS.workflows)
      .set({ enabled })
      .where('id', '=', id)
      .where('current', '=', true)
      .execute();
    if (result.updatedCount === 0) {
      throw new BadRequestError(`Current workflow ${String(id)} was not found.`);
    }
    const row = await this.database.query()
      .selectFrom(WORKFLOW_COLLECTIONS.workflows)
      .select(['id', 'key', 'title', 'enabled', 'type', 'current', 'inputSchema'])
      .where('id', '=', id)
      .where('current', '=', true)
      .executeTakeFirst<Row>();
    if (!row) {
      throw new BadRequestError(`Current workflow ${String(id)} was not found.`);
    }
    return toWorkflowListItem(row, await this.getExecutedCount(String(row.key)));
  }

  private async getExecutedCount(key: string, query = this.database.query()): Promise<number> {
    const executed = await query.selectFrom(WORKFLOW_COLLECTIONS.stats).where('key', '=', key).value('executed');
    return Number(executed ?? 0);
  }

  private async loadCurrentWorkflow(id: WorkflowId): Promise<NonNullable<Awaited<ReturnType<typeof loadWorkflow>>>> {
    const isCurrent = await this.database.query()
      .selectFrom(WORKFLOW_COLLECTIONS.workflows)
      .where('id', '=', id)
      .where('current', '=', true)
      .value('id');
    if (isCurrent == null) {
      throw new BadRequestError(`Current workflow ${String(id)} was not found.`);
    }
    const workflow = await loadWorkflow(this.database.query(), id);
    if (!workflow) {
      throw new BadRequestError(`Workflow ${String(id)} was not found.`);
    }
    return workflow;
  }

  private async findRun(eventKey: string, workflowKey: string): Promise<WorkflowRunListItem> {
    const row = await this.database.query()
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

function toWorkflowListItem(row: Row, executed: number): WorkflowListItem {
  return {
    id: asId(row.id),
    key: String(row.key ?? ''),
    title: row.title == null ? null : String(row.title),
    enabled: row.enabled === true || row.enabled === 1 || row.enabled === '1',
    type: String(row.type ?? ''),
    current: row.current == null ? null : row.current === true || row.current === 1 || row.current === '1',
    hasInputs: hasObjectKeys(row.inputSchema),
    executed,
  };
}

function hasObjectKeys(value: unknown): boolean {
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) && Object.keys(parsed).length > 0;
    } catch {
      return false;
    }
  }
  return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length > 0;
}

export class UnavailableWorkflowService implements WorkflowService {
  async list(): Promise<WorkflowListItem[]> {
    throw new ServiceUnavailableError('Workflow runtime is not configured.');
  }

  async enable(_id: WorkflowId): Promise<WorkflowListItem> {
    throw new ServiceUnavailableError('Workflow runtime is not configured.');
  }

  async disable(_id: WorkflowId): Promise<WorkflowListItem> {
    throw new ServiceUnavailableError('Workflow runtime is not configured.');
  }

  async getInputs(_id: WorkflowId): Promise<WorkflowInputSettings> {
    throw new ServiceUnavailableError('Workflow runtime is not configured.');
  }

  async updateInputs(_id: WorkflowId, _values: unknown): Promise<WorkflowInputSettings> {
    throw new ServiceUnavailableError('Workflow runtime is not configured.');
  }

  async runs(): Promise<WorkflowRunListItem[]> {
    throw new ServiceUnavailableError('Workflow runtime is not configured.');
  }

  async runsForWorkflow(_id: WorkflowId): Promise<WorkflowRunListItem[]> {
    throw new ServiceUnavailableError('Workflow runtime is not configured.');
  }

  async trigger(_workflowKey: string, _context: unknown): Promise<WorkflowRunListItem> {
    throw new ServiceUnavailableError('Workflow runtime is not configured.');
  }

  async run(_id: WorkflowId, _context: unknown): Promise<WorkflowRunListItem> {
    throw new ServiceUnavailableError('Workflow runtime is not configured.');
  }
}

function asId(value: unknown): WorkflowId {
  if (typeof value === 'number' || typeof value === 'string') return value;
  throw new Error('Workflow row has an invalid id.');
}

function toRunItem(row: Row): WorkflowRunListItem {
  return {
    id: asId(row.id),
    workflowId: asId(row.workflowId),
    workflowKey: String(row.workflowKey ?? ''),
    eventKey: String(row.eventKey ?? ''),
    status: row.status == null ? null : Number(row.status),
    output: row.output,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt ?? ''),
  };
}
