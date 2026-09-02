import type { DatabaseManager } from '@nocobase/db';
import type { NocoBaseQueueManager } from '@nocobase/queue';
import { randomUUID } from 'node:crypto';
import {
  LocalWorkflowArtifactStore,
  WorkflowLoader,
  type WorkflowDistArtifact,
} from './loader/index.js';
import {
  WorkflowEngine,
  assertInputSize,
  loadRun,
  loadWorkflow,
  type JsonObject,
  type WorkflowDefinition,
  type WorkflowEventOptions,
  type WorkflowInstructionClass,
  type WorkflowId,
  WorkflowInvocationError,
  type WorkflowTriggerReceipt,
  validateInputValue,
} from './engine/index.js';
import type { FsDriveDiskConfig } from '@nocobase/drive';
import { WORKFLOW_COLLECTIONS } from './collections/names.js';

export interface WorkflowServiceOptions {
  database: DatabaseManager;
  queue: NocoBaseQueueManager;
  queueName?: string;
  app?: unknown;
  sourceRoot?: string;
  distRoot: string;
  artifactDisk: FsDriveDiskConfig;
  production: boolean;
}

export class WorkflowService {
  private readonly database: DatabaseManager;
  private readonly store: LocalWorkflowArtifactStore;
  private readonly engine: WorkflowEngine;
  private readonly loader: WorkflowLoader;
  private initializationPromise: Promise<void> | undefined;

  constructor(options: WorkflowServiceOptions) {
    this.database = options.database;
    this.store = new LocalWorkflowArtifactStore({
      storeRoot: options.artifactDisk.location,
    });
    this.engine = new WorkflowEngine({
      database: options.database,
      queue: options.queue,
      ...(options.queueName === undefined
        ? {}
        : { queueName: options.queueName }),
      app: options.app,
      artifactStore: this.store,
      ...(!options.production && options.sourceRoot
        ? { developmentResourceRoot: options.sourceRoot }
        : {}),
    });
    this.loader = new WorkflowLoader({
      database: options.database,
      artifactStore: this.store,
      distRoot: options.distRoot,
      refreshEngine: (): Promise<void> => this.engine.refreshSourceResolvers(),
    });
  }

  registerInstruction(instruction: WorkflowInstructionClass): void {
    this.engine.registerInstruction(instruction);
  }

  async trigger(
    workflowKey: string,
    input: JsonObject,
    triggerOptions: WorkflowEventOptions = {},
  ): Promise<WorkflowTriggerReceipt> {
    const row = await this.database
      .query()
      .selectFrom(WORKFLOW_COLLECTIONS.workflows)
      .select(['id', 'enabled', 'hash'])
      .where('key', '=', workflowKey)
      .where('current', '=', true)
      .executeTakeFirst();
    if (!row) return { status: 'skipped', reason: 'not-found' };
    if (!triggerOptions.force && !triggerOptions.manually && !row.enabled)
      return { status: 'skipped', reason: 'disabled' };
    if (typeof row.hash === 'string')
      await this.loader.ensureMaterialized(row.hash);

    const workflow = await loadWorkflow(
      this.database.query(),
      row.id as string | number,
    );
    if (!workflow)
      throw new WorkflowInvocationError(
        'WORKFLOW_NOT_FOUND',
        `Workflow "${workflowKey}" was not found`,
      );

    return this.executeRevision(workflow, input, triggerOptions);
  }

  async triggerRevision(
    revisionId: WorkflowId,
    input: JsonObject,
    triggerOptions: WorkflowEventOptions = {},
  ): Promise<WorkflowTriggerReceipt> {
    const workflow = await loadWorkflow(this.database.query(), revisionId);
    if (!workflow)
      throw new WorkflowInvocationError(
        'WORKFLOW_NOT_FOUND',
        `Workflow revision "${String(revisionId)}" was not found`,
      );
    return this.executeRevision(workflow, input, triggerOptions);
  }

  refreshSourceResolvers(): Promise<void> {
    return this.engine.refreshSourceResolvers();
  }

  discoverArtifacts(): Promise<readonly WorkflowDistArtifact[]> {
    return this.loader.discover();
  }

  ensureArtifactMaterialized(hash: string): Promise<WorkflowId | undefined> {
    return this.loader.ensureMaterialized(hash);
  }

  async dispose(): Promise<void> {
    try {
      await this.initializationPromise;
    } catch {
      // A failed lazy initialization still leaves engine.dispose() safe to call.
    }
    this.initializationPromise = undefined;
    await this.engine.dispose();
  }

  private ensureInitialized(): Promise<void> {
    if (this.initializationPromise) return this.initializationPromise;
    this.initializationPromise = this.engine
      .initialize()
      .catch((error: unknown) => {
        this.initializationPromise = undefined;
        throw error;
      });
    return this.initializationPromise;
  }

  private async executeRevision(
    workflow: WorkflowDefinition,
    input: JsonObject,
    triggerOptions: WorkflowEventOptions = {},
  ): Promise<WorkflowTriggerReceipt> {
    if (!triggerOptions.force && !triggerOptions.manually && !workflow.enabled)
      return { status: 'skipped', reason: 'disabled' };

    const hash = workflow.hash;
    if (!hash || !(await this.store.has(workflow.key, hash)))
      throw new Error(
        `Workflow Artifact ${workflow.key}/${String(hash)} is missing`,
      );

    assertInputSize(input);
    const validation = validateInputValue(workflow.inputSchema, input);
    if (!validation.valid)
      throw new WorkflowInvocationError(
        'INVALID_INPUT',
        `Workflow "${workflow.key}" input is invalid`,
        validation.issues,
      );

    let stack = triggerOptions.stack ? [...triggerOptions.stack] : undefined;
    if (stack === undefined && triggerOptions.parentRunId !== undefined) {
      const parent = await loadRun(
        this.database.query(),
        triggerOptions.parentRunId,
      );
      if (!parent)
        throw new WorkflowInvocationError(
          'PARENT_RUN_NOT_FOUND',
          `Parent run "${String(triggerOptions.parentRunId)}" was not found`,
        );
      stack = [...parent.stack, parent.id];
    }
    if (stack?.length) {
      const repeats = await this.database
        .query()
        .selectFrom(WORKFLOW_COLLECTIONS.runs)
        .select(({ fn }) => [fn.countAll().as('count')])
        .where('workflowId', '=', workflow.id)
        .where('id', 'in', stack)
        .executeTakeFirst<{ count: number | string }>();
      const limit = Number(workflow.options.stackLimit ?? 1);
      if (Number(repeats?.count ?? 0) >= limit)
        throw new WorkflowInvocationError(
          'STACK_LIMIT_EXCEEDED',
          `Workflow "${workflow.key}" stack limit ${limit} was exceeded`,
        );
    }

    await this.ensureInitialized();
    const eventKey = triggerOptions.eventKey ?? randomUUID();
    await this.engine.trigger(workflow, input, {
      ...triggerOptions,
      eventKey,
      ...(triggerOptions.parentRunId === undefined
        ? {}
        : { parentRunId: triggerOptions.parentRunId }),
      ...(stack === undefined ? {} : { stack }),
    });
    return { status: 'accepted', eventKey };
  }
}

export type WorkflowServiceApi = Pick<
  WorkflowService,
  | 'trigger'
  | 'triggerRevision'
  | 'refreshSourceResolvers'
  | 'discoverArtifacts'
  | 'ensureArtifactMaterialized'
>;
