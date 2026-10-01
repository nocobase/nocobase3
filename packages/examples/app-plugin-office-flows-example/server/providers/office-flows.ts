import { jobExecutorServiceToken } from '@nocobase/app-server/jobs';
import { loggingToken } from '@nocobase/app-server/logging';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { databaseManagerToken } from '@nocobase/db';
import type { JobClass, JobExecutor, ScheduleExecutor } from '@nocobase/jobs';
import {
  createRepositoryLifecycleStore,
  LifecycleRuntime,
} from '@nocobase/lifecycle';
import { ServiceProvider } from '@nocobase/service-provider';

import { registerLifecycles } from '../lifecycles/index.js';
import { COLLECTIONS, OFFICE_FLOWS_SCOPE } from '../scope.js';
import {
  createEffectJob,
  type EffectJobPayload,
} from '../services/effect-job.js';
import { OfficeFlowsService } from '../services/office-flows.js';
import { OfficeStore } from '../services/store.js';
import { officeFlowsServiceToken } from '../tokens.js';

/** How often idle records are checked and due extraction tasks created. */
export const SWEEP_MS: number = 60_000;

/**
 * Wires the six lifecycles to the application: effects on a JobExecutor,
 * and one ScheduleExecutor rule that creates the extraction tasks falling
 * due. A real deployment would sweep once a day; the example sweeps every
 * minute so a new request shows its first task without waiting.
 */
export class OfficeFlowsProvider extends ServiceProvider<AppPluginApplication> {
  public readonly name: string = OFFICE_FLOWS_SCOPE;
  private jobs: JobExecutor | undefined;
  private schedule: ScheduleExecutor | undefined;
  private effectJob: JobClass<EffectJobPayload> | undefined;
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  private runtime: LifecycleRuntime | undefined;

  public override register(): void {
    this.app.container.singleton(officeFlowsServiceToken, () => {
      const database = this.app.container.resolve(databaseManagerToken);
      return new OfficeFlowsService(
        database,
        this.lifecycleRuntime(),
        new OfficeStore(database),
      );
    });
  }

  public override async start(): Promise<void> {
    const runtime = this.lifecycleRuntime();
    const service = this.app.container.resolve(officeFlowsServiceToken);
    const executors = this.app.container.resolve(jobExecutorServiceToken);

    const jobs = executors.getJobExecutor(OFFICE_FLOWS_SCOPE);
    this.effectJob = createEffectJob(runtime);
    jobs.registerJob(this.effectJob);
    await jobs.setup();
    this.jobs = jobs;

    const schedule = executors.getScheduleExecutor(OFFICE_FLOWS_SCOPE);
    await schedule.addJob({
      name: 'sweep',
      options: { every: SWEEP_MS },
      payload: {},
      execute: async () => {
        await service.runSchedule();
        await runtime.runTriggers();
      },
    });
    await schedule.setup();
    this.schedule = schedule;

    await runtime.recover();
  }

  public override async shutdown(): Promise<void> {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
    await this.schedule?.shutdown();
    this.schedule = undefined;
    await this.jobs?.shutdown();
    this.jobs = undefined;
  }

  private lifecycleRuntime(): LifecycleRuntime {
    if (this.runtime) return this.runtime;
    const database = this.app.container.resolve(databaseManagerToken);
    const logger = this.app.container
      .resolve(loggingToken)
      .getLogger('office-flows-example');
    const runtime = new LifecycleRuntime({
      store: createRepositoryLifecycleStore(database, {
        collections: {
          transitions: COLLECTIONS.transitions,
          effectRuns: COLLECTIONS.effectRuns,
        },
      }),
      dispatcher: {
        dispatch: (runId, { runAfter }) => this.dispatch(runId, runAfter),
      },
      logger: {
        warn: (message, details) => logger.warn({ details }, message),
        error: (message, details) => logger.error({ details }, message),
      },
    });
    registerLifecycles(runtime, new OfficeStore(database));
    this.runtime = runtime;
    return runtime;
  }

  /** The JobExecutor has no delay, so a retry with backoff waits here first. */
  private async dispatch(
    runId: string,
    runAfter: string | null,
  ): Promise<void> {
    const delay = runAfter === null ? 0 : Date.parse(runAfter) - Date.now();
    if (delay > 0) {
      const timer = setTimeout(() => {
        this.timers.delete(timer);
        void this.dispatch(runId, null);
      }, delay);
      timer.unref();
      this.timers.add(timer);
      return;
    }
    const jobs = this.jobs;
    const EffectJob = this.effectJob;
    if (!jobs || !EffectJob)
      throw new Error('The office flows example has not started.');
    await jobs.addJob(new EffectJob({ effectRunId: runId }));
  }
}
