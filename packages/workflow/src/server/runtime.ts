import type { DatabaseManager } from '@nocobase/database';
import path from 'node:path';

import Dispatcher from './dispatcher.js';
import { coreInstructions } from './instructions/index.js';
import { createRunInstruction, type WorkflowRunModuleResolver } from './instructions/run.js';
import type Processor from './processor.js';
import { createWorkflowQueueAdapter, type WorkflowQueueAdapter } from './queue-adapter.js';
import { createSourceDirResolver, WorkflowRunModuleError } from './run-module-resolver.js';
import WorkflowSourceLoader from './source-loader.js';
import { createTimeoutReaper, type TimeoutReaper } from './timeout-reaper.js';
import { coreTriggers } from './triggers/index.js';
import { WORKFLOW_COLLECTIONS } from '../collections/names.js';
import type { Row } from '@nocobase/database';
import type {
  WorkflowDefinition,
  WorkflowEventOptions,
  WorkflowInstruction,
  WorkflowLogger,
  WorkflowQueueTask,
  WorkflowRuntimeOptions,
  WorkflowTrigger,
} from './types.js';
import { noopWorkflowLogger } from './utils.js';

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
  readonly instructions: Map<string, WorkflowInstruction>;
  readonly triggers: Map<string, WorkflowTrigger>;
  readonly dispatcher: Dispatcher;
  readonly logger: WorkflowLogger;

  private readonly options: WorkflowRuntimeOptions;
  private readonly queueAdapter: WorkflowQueueAdapter | null;
  private readonly reaper: TimeoutReaper | null;
  private readonly sourceLoader: WorkflowSourceLoader | null;
  private readonly sourceResolversByHash: Map<string, WorkflowRunModuleResolver>;
  private running = false;

  constructor(options: WorkflowRuntimeOptions) {
    this.options = options;
    this.database = options.database;
    this.logger = options.logger ?? noopWorkflowLogger;
    this.sourceResolversByHash = new Map<string, WorkflowRunModuleResolver>();
    const sourceResolver: WorkflowRunModuleResolver = {
      resolve: (request) => {
        if (!request.hash) {
          return Promise.reject(new WorkflowRunModuleError(
            `Run node "${request.nodeKey}" has no workflow source hash`,
          ));
        }
        const resolver = this.sourceResolversByHash.get(request.hash);
        if (!resolver) {
          return Promise.reject(new WorkflowRunModuleError(
            `No source package is registered for workflow hash "${request.hash}"`,
          ));
        }
        return resolver.resolve(request);
      },
    };
    const applicationInstructions = new Map<string, WorkflowInstruction>(options.instructions);
    if (options.sources) {
      applicationInstructions.set('run', createRunInstruction({ resolver: sourceResolver, app: options.app }));
    }
    // Core registrations first, so an application entry under the same key
    // overrides the core one instead of being shadowed by it.
    this.instructions = new Map<string, WorkflowInstruction>([...coreInstructions, ...applicationInstructions]);
    this.triggers = new Map<string, WorkflowTrigger>([...coreTriggers, ...(options.triggers ?? [])]);
    this.sourceLoader = options.sources
      ? new WorkflowSourceLoader({
        database: options.database,
        ...(options.connectionName === undefined ? {} : { connectionName: options.connectionName }),
        instructions: this.instructions,
        triggers: this.triggers,
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
        ...(options.queueName === undefined ? {} : { queueName: options.queueName }),
      })
      : null;

    this.dispatcher = new Dispatcher({
      database: options.database,
      ...(options.connectionName === undefined ? {} : { connectionName: options.connectionName }),
      instructions: this.instructions,
      triggers: this.triggers,
      ...(this.queueAdapter === null ? {} : { queue: this.queueAdapter }),
      logger: this.logger,
      ...(options.environment === undefined ? {} : { environment: options.environment }),
      ...(options.functions === undefined ? {} : { functions: options.functions }),
    });

    this.reaper = options.timeoutReaper === false
      ? null
      : createTimeoutReaper({
        database: options.database,
        ...(options.connectionName === undefined ? {} : { connectionName: options.connectionName }),
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
      this.options.recoverGracePeriod === undefined ? {} : { gracePeriod: this.options.recoverGracePeriod },
    );
    if (recovered) {
      this.logger.info(`Workflow runtime re-published ${recovered} undispatched run(s)`);
    }
  }

  async refreshSourceResolvers(): Promise<void> {
    const sources = this.options.sources;
    if (!sources) return;
    const rows = await this.database.query()
      .selectFrom(WORKFLOW_COLLECTIONS.workflows)
      .select(['key', 'hash'])
      .where('current', '=', true)
      .execute<Row>();
    this.sourceResolversByHash.clear();
    for (const row of rows) {
      if (typeof row.key !== 'string' || typeof row.hash !== 'string') continue;
      this.sourceResolversByHash.set(row.hash, createSourceDirResolver({
        rootPath: path.join(sources.rootPath, row.key),
        enabled: true,
      }));
      if (sources.autoEnable === true) {
        await this.database.query()
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

  /** Raise an event on a workflow. Delegates to the dispatcher unchanged. */
  trigger(
    workflow: WorkflowDefinition,
    context: unknown,
    options: WorkflowEventOptions = {},
  ): Promise<Processor | null | void> {
    return this.dispatcher.trigger(workflow, context, options);
  }

  /** Resume or re-run a persisted execution. This is what the queue worker calls. */
  dispatch(task: WorkflowQueueTask): Promise<Processor | null> {
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
}
