import type { DatabaseManager } from '@nocobase/database';
import path from 'node:path';

import Dispatcher from './dispatcher.js';
import { coreInstructions } from './instructions/index.js';
import {
  createRunInstruction,
  type WorkflowRunModuleResolver,
} from './instructions/run.js';
import type Processor from './processor.js';
import {
  createWorkflowQueueAdapter,
  type WorkflowQueueAdapter,
} from './queue-adapter.js';
import {
  createSourceDirResolver,
  WorkflowRunModuleError,
} from './run-module-resolver.js';
import WorkflowSourceLoader from './source-loader.js';
import { createTimeoutReaper, type TimeoutReaper } from './timeout-reaper.js';
import { WORKFLOW_COLLECTIONS } from '../collections/names.js';
import type { Row } from '@nocobase/database';
import type {
  JsonObject,
  WorkflowDefinition,
  WorkflowEventOptions,
  WorkflowInstructionClass,
  WorkflowLogger,
  WorkflowQueueTask,
  WorkflowRuntimeOptions,
} from './types.js';
import { noopWorkflowLogger } from './utils.js';
import { loadNodeRun, loadRun, loadWorkflow, serializeJson } from './utils.js';
import {
  assertContextSize,
  validateContextValue,
  WorkflowInvocationError,
  type WorkflowTriggerReceipt,
  type WorkflowTriggerOptions,
} from './invocation-contract.js';
import { randomUUID } from 'node:crypto';
import { ArtifactResolver } from './artifact-resolver.js';

/**
 * The assembly layer.
 *
 * Everything below it is independently usable — a test can build a `Dispatcher`
 * by hand — but an application should not have to know that a queue adapter has
 * to be created before the dispatcher, that the reaper is a separate timer, or
 * that `beforeStop()` must run before the worker is torn down. That ordering is
 * the only thing this class owns; it adds no execution semantics of its own.
 */
export default class WorkflowRuntime {
  readonly database: DatabaseManager;
  readonly instructions: Map<string, WorkflowInstructionClass>;
  readonly dispatcher: Dispatcher;
  readonly logger: WorkflowLogger;

  private readonly options: WorkflowRuntimeOptions;
  private readonly queueAdapter: WorkflowQueueAdapter | null;
  private readonly reaper: TimeoutReaper | null;
  private readonly sourceLoader: WorkflowSourceLoader | null;
  private readonly sourceResolversByHash: Map<
    string,
    WorkflowRunModuleResolver
  >;
  private running = false;

  constructor(options: WorkflowRuntimeOptions) {
    this.options = options;
    this.database = options.database;
    this.logger = options.logger ?? noopWorkflowLogger;
    this.sourceResolversByHash = new Map<string, WorkflowRunModuleResolver>();
    const sourceResolver: WorkflowRunModuleResolver =
      options.allowSourceRunModules === true && options.diagnosticSourceRoot
        ? {
            resolve: (request) =>
              createSourceDirResolver({
                rootPath: path.join(
                  options.diagnosticSourceRoot as string,
                  request.workflowKey,
                ),
                enabled: true,
              }).resolve(request),
          }
        : options.artifactStore
          ? new ArtifactResolver({ store: options.artifactStore })
          : {
              resolve: (request) => {
                if (!request.hash) {
                  return Promise.reject(
                    new WorkflowRunModuleError(
                      `Run node "${request.nodeKey}" has no workflow source hash`,
                    ),
                  );
                }
                const resolver = this.sourceResolversByHash.get(request.hash);
                if (!resolver) {
                  return Promise.reject(
                    new WorkflowRunModuleError(
                      `No source package is registered for workflow hash "${request.hash}"`,
                    ),
                  );
                }
                return resolver.resolve(request);
              },
            };
    const applicationInstructions = new Map<string, WorkflowInstructionClass>(
      options.instructions,
    );
    if (
      options.artifactStore ||
      (options.sources && options.allowSourceRunModules === true)
    ) {
      applicationInstructions.set(
        'run',
        createRunInstruction({ resolver: sourceResolver, app: options.app }),
      );
    }
    // Core registrations first, so an application entry under the same key
    // overrides the core one instead of being shadowed by it.
    this.instructions = new Map<string, WorkflowInstructionClass>([
      ...coreInstructions,
      ...applicationInstructions,
    ]);
    this.sourceLoader = options.sources
      ? new WorkflowSourceLoader({
          database: options.database,
          ...(options.connectionName === undefined
            ? {}
            : { connectionName: options.connectionName }),
          instructions: this.instructions,
          defaultRootPath: options.sources.rootPath,
          autoActivate: options.sources.autoActivate === true,
        })
      : null;

    // The adapter has to exist before the dispatcher, because the dispatcher
    // takes it as its `queue`. Creating it also claims the queue name globally,
    // which `stop()` releases.
    this.queueAdapter = options.queue
      ? createWorkflowQueueAdapter({
          queue: options.queue,
          dispatch: (task: WorkflowQueueTask) => this.dispatch(task),
          ...(options.queueName === undefined
            ? {}
            : { queueName: options.queueName }),
        })
      : null;

    this.dispatcher = new Dispatcher({
      database: options.database,
      ...(options.connectionName === undefined
        ? {}
        : { connectionName: options.connectionName }),
      instructions: this.instructions,
      ...(this.queueAdapter === null ? {} : { queue: this.queueAdapter }),
      logger: this.logger,
      ...(options.environment === undefined
        ? {}
        : { environment: options.environment }),
      ...(options.functions === undefined
        ? {}
        : { functions: options.functions }),
    });

    this.reaper =
      options.timeoutReaper === false
        ? null
        : createTimeoutReaper({
            database: options.database,
            ...(options.connectionName === undefined
              ? {}
              : { connectionName: options.connectionName }),
            logger: this.logger,
            ...(options.timeoutReaperIntervalMs === undefined
              ? {}
              : { intervalMs: options.timeoutReaperIntervalMs }),
            ...(options.timeoutReaperBatchSize === undefined
              ? {}
              : { batchSize: options.timeoutReaperBatchSize }),
          });
  }

  get started(): boolean {
    return this.running;
  }

  /** `true` once every task the dispatcher accepted has settled. */
  get idle(): boolean {
    return this.dispatcher.idle;
  }

  /**
   * Order matters: the worker and the reaper have to be able to run before
   * `recover()` re-publishes what a previous process left behind.
   */
  async start(): Promise<void> {
    if (this.running) {
      return;
    }
    await this.sourceLoader?.load();
    await this.refreshSourceResolvers();
    this.running = true;
    this.dispatcher.setReady(true);
    await this.queueAdapter?.startWorker();
    this.reaper?.start();
    const recovered = await this.dispatcher.recover(
      this.options.recoverGracePeriod === undefined
        ? {}
        : { gracePeriod: this.options.recoverGracePeriod },
    );
    if (recovered) {
      this.logger.info(
        `Workflow runtime re-published ${recovered} undispatched run(s)`,
      );
    }
  }

  async refreshSourceResolvers(): Promise<void> {
    const sources = this.options.sources;
    if (!sources) return;
    const rows = await this.database
      .query()
      .selectFrom(WORKFLOW_COLLECTIONS.workflows)
      .select(['key', 'hash'])
      .where('current', '=', true)
      .execute<Row>();
    this.sourceResolversByHash.clear();
    for (const row of rows) {
      if (typeof row.key !== 'string' || typeof row.hash !== 'string') continue;
      this.sourceResolversByHash.set(
        row.hash,
        createSourceDirResolver({
          rootPath: path.join(sources.rootPath, row.key),
          enabled: true,
        }),
      );
      if (sources.autoEnable === true) {
        await this.database
          .query()
          .updateTable(WORKFLOW_COLLECTIONS.workflows)
          .set({ enabled: true })
          .where('key', '=', row.key)
          .where('current', '=', true)
          .execute();
      }
    }
  }

  /**
   * The mirror image of `start()`: stop producing work, let what is in flight
   * finish, and only then release the queue name.
   *
   * Deliberately not guarded by `running`: a process that only ever published
   * tasks still holds the queue name from the moment it was constructed, and it
   * has to be able to give it back.
   */
  async stop(): Promise<void> {
    this.running = false;
    this.reaper?.stop();
    await this.dispatcher.beforeStop();
    await this.queueAdapter?.stop();
  }

  /** Resume or re-run a persisted execution. This is what the queue worker calls. */
  dispatch(task: WorkflowQueueTask): Promise<Processor | null | void> {
    if ('type' in task && task.type === 'trigger') {
      return this.dispatchTrigger(task);
    }
    return this.dispatcher.dispatch(task);
  }

  /** Publish a task instead of running it inline; in-process when no queue is configured. */
  enqueue(task: WorkflowQueueTask): Promise<void> {
    return this.dispatcher.enqueue(task);
  }

  /**
   * Run one timeout sweep now instead of waiting for the interval. Returns how
   * many runs were reclaimed, or `0` when the reaper is disabled.
   */
  async sweepTimeouts(): Promise<number> {
    return this.reaper ? this.reaper.sweep() : 0;
  }

  trigger(
    workflowKey: string,
    context: JsonObject,
    options?: WorkflowTriggerOptions,
  ): Promise<WorkflowTriggerReceipt>;
  /** @deprecated Compatibility entry point; new callers pass a workflow key. */
  trigger(
    workflow: WorkflowDefinition,
    context: JsonObject,
    options?: WorkflowEventOptions,
  ): Promise<Processor | null | void>;
  async trigger(
    workflowOrKey: string | WorkflowDefinition,
    context: JsonObject,
    options: WorkflowTriggerOptions | WorkflowEventOptions = {},
  ): Promise<WorkflowTriggerReceipt | Processor | null | void> {
    if (typeof workflowOrKey !== 'string') {
      return this.dispatcher.trigger(workflowOrKey, context, options);
    }
    if (!this.running)
      throw new WorkflowInvocationError(
        'WORKFLOW_NOT_FOUND',
        'Workflow runtime is not started',
      );
    const workflow = await this.loadCurrentWorkflow(workflowOrKey);
    if (!workflow.enabled)
      throw new WorkflowInvocationError(
        'WORKFLOW_DISABLED',
        `Workflow "${workflowOrKey}" is disabled`,
      );
    assertContextSize(context);
    const validation = validateContextValue(workflow.contextSchema, context);
    if (!validation.valid)
      throw new WorkflowInvocationError(
        'INVALID_CONTEXT',
        `Workflow "${workflowOrKey}" context is invalid`,
        validation.issues,
      );

    const invocation: WorkflowTriggerOptions = {
      ...(options.eventKey === undefined ? {} : { eventKey: options.eventKey }),
      ...(options.parentRunId === undefined
        ? {}
        : { parentRunId: options.parentRunId }),
    };
    if (invocation.parentRunId !== undefined) {
      const parent = await loadRun(
        this.database.query(this.options.connectionName),
        invocation.parentRunId,
      );
      if (!parent)
        throw new WorkflowInvocationError(
          'PARENT_RUN_NOT_FOUND',
          `Parent run "${String(invocation.parentRunId)}" was not found`,
        );
      const stack = [...parent.stack, parent.id];
      const repeats = await this.database
        .query(this.options.connectionName)
        .selectFrom(WORKFLOW_COLLECTIONS.runs)
        .select(({ fn }) => [fn.countAll().as('count')])
        .where('workflowId', '=', workflow.id)
        .where('id', 'in', stack)
        .executeTakeFirst<{ count: number | string }>();
      const limit = Number(workflow.options.stackLimit ?? 1);
      if (Number(repeats?.count ?? 0) >= limit) {
        throw new WorkflowInvocationError(
          'STACK_LIMIT_EXCEEDED',
          `Workflow "${workflow.key}" stack limit ${limit} was exceeded`,
        );
      }
    }
    const eventKey = invocation.eventKey ?? randomUUID();
    const task: import('./types.js').WorkflowTriggerQueueTask = {
      type: 'trigger',
      workflowId: workflow.id,
      eventKey,
      context,
      inputValues: workflow.inputValues,
      ...(invocation.parentRunId === undefined
        ? {}
        : { parentRunId: invocation.parentRunId }),
    };
    if (this.queueAdapter) await this.queueAdapter.publish(task);
    else await this.dispatchTrigger(task);
    return { status: 'accepted', eventKey };
  }

  async resume(
    runId: import('./types.js').WorkflowId,
    nodeRunId: import('./types.js').WorkflowId,
    result: unknown,
  ): Promise<void> {
    const nodeRun = await loadNodeRun(
      this.database.query(this.options.connectionName),
      nodeRunId,
    );
    if (!nodeRun || String(nodeRun.workflowRunId) !== String(runId))
      throw new Error(
        `Node run "${String(nodeRunId)}" does not belong to run "${String(runId)}"`,
      );
    await this.database
      .query(this.options.connectionName)
      .updateTable(WORKFLOW_COLLECTIONS.nodeRuns)
      .set({ result: serializeJson(result) })
      .where('id', '=', nodeRunId)
      .execute();
    await this.dispatcher.dispatch({ executionId: runId, nodeRunId });
  }

  private async loadCurrentWorkflow(key: string): Promise<WorkflowDefinition> {
    const row = await this.database
      .query(this.options.connectionName)
      .selectFrom(WORKFLOW_COLLECTIONS.workflows)
      .select('id')
      .where('key', '=', key)
      .where('current', '=', true)
      .executeTakeFirst<Row>();
    if (!row)
      throw new WorkflowInvocationError(
        'WORKFLOW_NOT_FOUND',
        `Workflow "${key}" was not found`,
      );
    const workflow = await loadWorkflow(
      this.database.query(this.options.connectionName),
      row.id as string | number,
    );
    if (!workflow)
      throw new WorkflowInvocationError(
        'WORKFLOW_NOT_FOUND',
        `Workflow "${key}" was not found`,
      );
    return workflow;
  }

  private async dispatchTrigger(
    task: import('./types.js').WorkflowTriggerQueueTask,
  ): Promise<Processor | null | void> {
    const workflow = await loadWorkflow(
      this.database.query(this.options.connectionName),
      task.workflowId,
    );
    if (!workflow) {
      throw new WorkflowInvocationError(
        'WORKFLOW_NOT_FOUND',
        `Workflow version "${String(task.workflowId)}" was not found`,
      );
    }
    return this.dispatcher.trigger(workflow, task.context, {
      eventKey: task.eventKey,
      inputValues: task.inputValues,
      force: true,
      ...(task.parentRunId === undefined
        ? {}
        : { parentRunId: task.parentRunId }),
    });
  }
}
