import { randomUUID } from 'node:crypto';

import type { DatabaseManager, QueryAdapter, Row } from '@nocobase/db';

import { WORKFLOW_COLLECTIONS } from '../collections/names.js';
import { EXECUTION_STATUS } from './constants.js';
import Processor from './processor.js';
import type {
  ProcessorRerunOptions,
  WorkflowDefinition,
  WorkflowEventOptions,
  WorkflowId,
  WorkflowInstructionClass,
  WorkflowLogger,
  WorkflowQueue,
  WorkflowQueueTask,
  WorkflowExecutionQueueTask,
  WorkflowRun,
  WorkflowNodeRun,
} from './types.js';
import {
  hydrateRun,
  loadNodeRun,
  loadRun,
  loadWorkflow,
  noopWorkflowLogger,
  serializeJson,
} from './utils.js';
import {
  normalizeWorkflowParameterValues,
  resolveWorkflowParameters,
} from './parameters.js';

export interface DispatcherOptions {
  database: DatabaseManager;
  connectionName?: string;
  instructions: Map<string, WorkflowInstructionClass>;
  resolveWorkflowResourceRoot?: (
    workflow: WorkflowDefinition,
    execution: WorkflowRun,
  ) => Promise<string | null>;
  services?: import('./run-services.js').WorkflowRunServices;
  queue?: WorkflowQueue;
  logger?:
    | WorkflowLogger
    | ((workflowId: WorkflowId | 'dispatcher') => WorkflowLogger);
  environment?: Record<string, unknown> | (() => Record<string, unknown>);
  functions?: Record<string, (...args: unknown[]) => unknown>;
}

type ExecutionPlan = {
  execution: WorkflowRun;
  workflow: WorkflowDefinition;
  nodeRun?: WorkflowNodeRun;
  rerun?: ProcessorRerunOptions;
};

const RECOVERY_BATCH_SIZE = 100;

function statusIsQueueing(status: number | null): boolean {
  return status === EXECUTION_STATUS.QUEUEING;
}

export default class Dispatcher {
  private readonly inFlight = new Set<Promise<unknown>>();
  private readonly pendingEventKeys = new Set<string>();
  private readonly executionLocks = new Map<string, Promise<void>>();

  constructor(private readonly options: DispatcherOptions) {}

  get idle(): boolean {
    return this.inFlight.size === 0 && this.pendingEventKeys.size === 0;
  }

  trigger(
    workflow: WorkflowDefinition,
    input: unknown,
    options: WorkflowEventOptions = {},
  ): Promise<Processor | null | void> {
    const operation = this.triggerEvent(workflow, input, options);
    this.inFlight.add(operation);
    return operation.finally(() => {
      this.inFlight.delete(operation);
    });
  }

  private async triggerEvent(
    workflow: WorkflowDefinition,
    input: unknown,
    options: WorkflowEventOptions,
  ): Promise<Processor | null | void> {
    const logger = this.getLogger(workflow.id);
    if (!options.force && !options.manually && !workflow.enabled) {
      logger.warn(`Workflow "${workflow.key}" is disabled; event ignored`);
      return;
    }
    if (input == null) {
      const error = new Error('Workflow input must not be null');
      await this.handleTriggerFail(workflow, input, options, error);
      throw error;
    }

    const eventKey = options.eventKey ?? randomUUID();
    if (this.pendingEventKeys.has(eventKey)) {
      logger.warn(`Duplicate workflow event "${eventKey}" ignored`);
      return;
    }
    if (
      await this.options.database
        .query(this.options.connectionName)
        .selectFrom(WORKFLOW_COLLECTIONS.runs)
        .where('eventKey', '=', eventKey)
        .exists()
    ) {
      logger.warn(
        `Persisted workflow event "${eventKey}" already exists; event ignored`,
      );
      return;
    }

    this.pendingEventKeys.add(eventKey);
    try {
      const execution = await this.createExecution(workflow, input, {
        ...options,
        eventKey,
      });
      if (options.deferred || options.manually) {
        const entered = await this.acquireExecution(execution, workflow);
        return entered ? this.process({ execution: entered, workflow }) : null;
      }
      await this.enqueue({ executionId: execution.id });
      return null;
    } finally {
      this.pendingEventKeys.delete(eventKey);
    }
  }

  async dispatch(task: WorkflowQueueTask): Promise<Processor | null> {
    const operation = this.resolveAndProcessTask(task);
    this.inFlight.add(operation);
    try {
      return await operation;
    } finally {
      this.inFlight.delete(operation);
    }
  }

  async recover(options: { gracePeriod?: number } = {}): Promise<number> {
    const query = this.options.database.query(this.options.connectionName);
    let selection = query
      .selectFrom(WORKFLOW_COLLECTIONS.runs)
      .selectAll()
      .where('dispatched', '=', false)
      .where('status', 'is', null)
      .orderBy('id')
      .limit(RECOVERY_BATCH_SIZE);
    if ((options.gracePeriod ?? 0) > 0) {
      selection = selection.where(
        'createdAt',
        '<',
        new Date(Date.now() - (options.gracePeriod ?? 0)).toISOString(),
      );
    }
    const rows = await selection.execute<Row>();
    let recovered = 0;
    for (const row of rows) {
      const execution = hydrateRun(row);
      const workflow = await loadWorkflow(query, execution.workflowId);
      if (!workflow?.enabled) {
        continue;
      }
      await this.enqueue({ executionId: execution.id });
      recovered += 1;
    }
    return recovered;
  }

  async drain(): Promise<void> {
    await Promise.allSettled([...this.inFlight]);
  }

  async enqueue(task: WorkflowQueueTask): Promise<void> {
    if (this.options.queue) {
      await this.options.queue.publish(task);
      return;
    }
    await this.dispatch(task);
  }

  private async resolveAndProcessTask(
    task: WorkflowExecutionQueueTask,
  ): Promise<Processor | null> {
    const query = this.options.database.query(this.options.connectionName);
    const execution = await loadRun(query, task.executionId);
    if (!execution) {
      this.getLogger('dispatcher').warn(
        `Execution "${task.executionId}" was not found; queue task ignored`,
      );
      return null;
    }
    if (
      !task.nodeRunId &&
      !task.rerun &&
      execution.status === EXECUTION_STATUS.STARTED &&
      execution.startedAt
    ) {
      this.getLogger(execution.workflowId).warn(
        `Execution "${execution.id}" has already started; task ignored`,
      );
      return null;
    }

    const workflow = await loadWorkflow(query, execution.workflowId);
    if (!workflow) {
      this.getLogger(execution.workflowId).warn(
        `Workflow "${execution.workflowId}" was not found`,
      );
      return null;
    }

    let nodeRun: WorkflowNodeRun | undefined;
    if (task.nodeRunId != null) {
      nodeRun = (await loadNodeRun(query, task.nodeRunId)) ?? undefined;
      if (!nodeRun || String(nodeRun.workflowRunId) !== String(execution.id)) {
        this.getLogger(execution.workflowId).warn(
          `Node run "${task.nodeRunId}" does not belong to execution "${execution.id}"`,
        );
        return null;
      }
    }

    const entered = await this.acquireExecution(execution, workflow);
    if (!entered) {
      return null;
    }
    return this.process({
      execution: entered,
      workflow,
      nodeRun,
      rerun: task.rerun,
    });
  }

  private async createExecution(
    workflow: WorkflowDefinition,
    input: unknown,
    options: WorkflowEventOptions,
  ): Promise<WorkflowRun> {
    const stack = await this.resolveStack(options);
    try {
      if (!(await this.validateEvent(workflow, input, { ...options, stack }))) {
        throw new Error('Workflow event is not valid');
      }

      return await this.options.database.transaction(async (connection) => {
        const query = connection.query;
        const eventKey = options.eventKey ?? randomUUID();
        const createdAt = new Date().toISOString();
        const parameters = resolveWorkflowParameters(
          workflow.parametersSchema,
          options.parameterValues
            ? normalizeWorkflowParameterValues(
                workflow.parametersSchema,
                options.parameterValues,
              )
            : workflow.parameterValues,
        );
        await query
          .insertInto(WORKFLOW_COLLECTIONS.runs)
          .values({
            workflowId: workflow.id,
            workflowKey: workflow.key,
            hash: workflow.hash,
            eventKey,
            input: serializeJson(input),
            parameters: serializeJson(parameters),
            status: options.deferred
              ? EXECUTION_STATUS.STARTED
              : EXECUTION_STATUS.QUEUEING,
            dispatched: options.deferred ?? false,
            parentRunId: options.parentRunId ?? null,
            stack: serializeJson(stack),
            output: serializeJson(null),
            startedAt: options.deferred ? createdAt : null,
            finishedAt: null,
            expiresAt: options.deferred
              ? this.getExpiresAt(workflow, createdAt)
              : null,
            createdAt,
            manually: options.manually ?? false,
            reason: null,
          })
          .execute();
        const row = await query
          .selectFrom(WORKFLOW_COLLECTIONS.runs)
          .selectAll()
          .where('eventKey', '=', eventKey)
          .executeTakeFirstOrThrow<Row>();
        await this.incrementStats(query, workflow);
        const execution = hydrateRun(row);
        execution.workflow = workflow;
        return execution;
      }, this.options.connectionName);
    } catch (error) {
      await this.handleTriggerFail(workflow, input, options, error);
      throw error;
    }
  }

  private async acquireExecution(
    execution: WorkflowRun,
    workflow: WorkflowDefinition,
  ): Promise<WorkflowRun | null> {
    if (
      execution.dispatched &&
      execution.status === EXECUTION_STATUS.STARTED &&
      execution.startedAt
    ) {
      execution.workflow = workflow;
      return execution;
    }
    if (!statusIsQueueing(execution.status)) {
      return null;
    }

    const startedAt = new Date().toISOString();
    const query = this.options.database.query(this.options.connectionName);
    const result = await query
      .updateTable(WORKFLOW_COLLECTIONS.runs)
      .set({
        dispatched: true,
        status: EXECUTION_STATUS.STARTED,
        startedAt,
        finishedAt: null,
        expiresAt: this.getExpiresAt(workflow, startedAt),
      })
      .where('id', '=', execution.id)
      .where('dispatched', '=', false)
      .where('status', 'is', null)
      .execute();
    if ((result.updatedCount ?? 0) === 0) {
      return null;
    }
    const entered = await loadRun(query, execution.id);
    if (entered) {
      entered.workflow = workflow;
    }
    return entered;
  }

  private async process(plan: ExecutionPlan): Promise<Processor> {
    const logger = this.getLogger(plan.workflow.id);
    return this.withExecutionLock(plan.execution.id, async () => {
      const workflowResourceRoot =
        (await this.options.resolveWorkflowResourceRoot?.(
          plan.workflow,
          plan.execution,
        )) ?? null;
      const processor = new Processor({
        database: this.options.database,
        connectionName: this.options.connectionName,
        workflow: plan.workflow,
        execution: plan.execution,
        instructions: this.options.instructions,
        workflowResourceRoot,
        services: this.options.services,
        logger,
        environment: this.options.environment,
        functions: this.options.functions,
      });
      try {
        if (plan.rerun) {
          await processor.rerun(plan.rerun);
        } else if (plan.nodeRun) {
          await processor.resume(plan.nodeRun);
        } else {
          await processor.start();
        }
      } catch (error) {
        logger.error(`Execution "${plan.execution.id}" failed`, { error });
        await processor.exit(-2, {
          message: error instanceof Error ? error.message : String(error),
        });
      }
      return processor;
    });
  }

  private async validateEvent(
    workflow: WorkflowDefinition,
    _context: unknown,
    options: WorkflowEventOptions,
  ): Promise<boolean> {
    const stack = options.stack ?? [];
    if (stack.length) {
      const countRow = await this.options.database
        .query(this.options.connectionName)
        .selectFrom(WORKFLOW_COLLECTIONS.runs)
        .select(({ fn }) => [fn.countAll().as('count')])
        .where('workflowId', '=', workflow.id)
        .where('id', 'in', stack)
        .executeTakeFirst<{ count: number | string }>();
      const limit = Number(workflow.options.stackLimit ?? 1);
      if (Number(countRow?.count ?? 0) >= limit) {
        return false;
      }
    }
    return true;
  }

  private async resolveStack(
    options: WorkflowEventOptions,
  ): Promise<WorkflowId[]> {
    if (options.stack) {
      return [...options.stack];
    }
    const parentRunId = options.parentRunId;
    if (parentRunId == null) {
      return [];
    }
    const parent = await loadRun(
      this.options.database.query(this.options.connectionName),
      parentRunId,
    );
    return parent ? [...parent.stack, parent.id] : [];
  }

  private async incrementStats(
    query: QueryAdapter,
    workflow: WorkflowDefinition,
  ): Promise<void> {
    const workflowStats = await query
      .selectFrom(WORKFLOW_COLLECTIONS.stats)
      .selectAll()
      .where('key', '=', workflow.key)
      .executeTakeFirst<Row>();
    if (workflowStats) {
      await query
        .updateTable(WORKFLOW_COLLECTIONS.stats)
        .set({ executed: Number(workflowStats.executed ?? 0) + 1 })
        .where('key', '=', workflow.key)
        .execute();
    } else {
      await query
        .insertInto(WORKFLOW_COLLECTIONS.stats)
        .values({ key: workflow.key, executed: 1 })
        .execute();
    }

    const versionStats = await query
      .selectFrom(WORKFLOW_COLLECTIONS.versionStats)
      .selectAll()
      .where('id', '=', workflow.id)
      .executeTakeFirst<Row>();
    if (versionStats) {
      await query
        .updateTable(WORKFLOW_COLLECTIONS.versionStats)
        .set({ executed: Number(versionStats.executed ?? 0) + 1 })
        .where('id', '=', workflow.id)
        .execute();
    } else {
      await query
        .insertInto(WORKFLOW_COLLECTIONS.versionStats)
        .values({ id: workflow.id, executed: 1 })
        .execute();
    }
  }

  private getExpiresAt(
    workflow: WorkflowDefinition,
    startedAt: string,
  ): string | null {
    const timeout = Number(workflow.options.timeout ?? 0);
    return Number.isFinite(timeout) && timeout > 0
      ? new Date(new Date(startedAt).getTime() + timeout * 1000).toISOString()
      : null;
  }

  private async handleTriggerFail(
    workflow: WorkflowDefinition,
    input: unknown,
    options: WorkflowEventOptions,
    error?: unknown,
  ): Promise<void> {
    try {
      await options.onTriggerFail?.(workflow, input, options, error);
    } catch (callbackError) {
      this.getLogger(workflow.id).error(
        'Workflow trigger failure callback failed',
        { error: callbackError },
      );
    }
  }

  private getLogger(workflowId: WorkflowId | 'dispatcher'): WorkflowLogger {
    if (typeof this.options.logger === 'function') {
      return this.options.logger(workflowId);
    }
    return this.options.logger ?? noopWorkflowLogger;
  }

  private async withExecutionLock<T>(
    executionId: WorkflowId,
    operation: () => Promise<T>,
  ): Promise<T> {
    const key = String(executionId);
    const previous = this.executionLocks.get(key) ?? Promise.resolve();
    let release: () => void = () => undefined;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const chain = previous.then(() => current);
    this.executionLocks.set(key, chain);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (this.executionLocks.get(key) === chain) {
        this.executionLocks.delete(key);
      }
    }
  }
}
