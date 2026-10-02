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

import { expenseLifecycle } from '../lifecycles/expense.js';
import { createExampleServices } from '../lifecycles/services.js';
import { ticketLifecycle } from '../lifecycles/ticket.js';
import {
  LIFECYCLE_EXAMPLE_COLLECTIONS,
  LIFECYCLE_EXAMPLE_SCOPE,
} from '../scope.js';
import {
  createEffectJob,
  type EffectJobPayload,
} from '../services/effect-job.js';
import { LifecycleExampleService } from '../services/lifecycle-example.js';
import { lifecycleExampleServiceToken } from '../tokens.js';

/** How often the triggers are swept. */
export const TRIGGER_SWEEP_MS: number = 10_000;

/**
 * Wires the lifecycles to the application: the Repository store on the
 * default connection, effects on a JobExecutor, and the trigger sweep on a
 * ScheduleExecutor rule. Recovery runs once the executors consume, so
 * effects a stopped process left queued are picked up again.
 */
export class LifecycleExampleProvider extends ServiceProvider<AppPluginApplication> {
  public readonly name: string = LIFECYCLE_EXAMPLE_SCOPE;
  private jobs: JobExecutor | undefined;
  private schedule: ScheduleExecutor | undefined;
  private effectJob: JobClass<EffectJobPayload> | undefined;
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  private runtime: LifecycleRuntime | undefined;

  public override register(): void {
    this.app.container.singleton(
      lifecycleExampleServiceToken,
      () =>
        new LifecycleExampleService(
          this.app.container.resolve(databaseManagerToken),
          this.lifecycleRuntime(),
        ),
    );
  }

  public override async start(): Promise<void> {
    const runtime = this.lifecycleRuntime();
    const executors = this.app.container.resolve(jobExecutorServiceToken);

    const jobs = executors.getJobExecutor(LIFECYCLE_EXAMPLE_SCOPE);
    this.effectJob = createEffectJob(runtime);
    // Registered before setup(): a run queued by an earlier process must find it.
    jobs.registerJob(this.effectJob);
    await jobs.setup();
    this.jobs = jobs;

    const schedule = executors.getScheduleExecutor(LIFECYCLE_EXAMPLE_SCOPE);
    await schedule.addJob({
      name: 'triggers',
      options: { every: TRIGGER_SWEEP_MS },
      payload: {},
      execute: async () => {
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

  /** One runtime for the service and the executors, created on first use. */
  private lifecycleRuntime(): LifecycleRuntime {
    if (this.runtime) return this.runtime;
    const logger = this.app.container
      .resolve(loggingToken)
      .getLogger('lifecycle-example');
    const runtime = new LifecycleRuntime({
      store: createRepositoryLifecycleStore(
        this.app.container.resolve(databaseManagerToken),
        {
          collections: {
            transitions: LIFECYCLE_EXAMPLE_COLLECTIONS.transitions,
            effectRuns: LIFECYCLE_EXAMPLE_COLLECTIONS.effectRuns,
          },
        },
      ),
      dispatcher: {
        dispatch: (runId, { runAfter }) => this.dispatch(runId, runAfter),
      },
      logger: {
        warn: (message, details) => logger.warn({ details }, message),
        error: (message, details) => logger.error({ details }, message),
      },
    });
    const services = createExampleServices({
      info: (message, details) => logger.info(details, message),
    });
    runtime.register(ticketLifecycle, { services });
    runtime.register(expenseLifecycle, { services });
    // Another plugin would subscribe the same way, to refresh a page, keep a
    // to-do list or feed a search index; work that must happen is an effect.
    runtime.on('completed', {}, (event) => {
      logger.info(
        {
          lifecycle: event.lifecycle,
          recordId: event.entry.recordId,
          transition: event.transition,
          from: event.from,
          to: event.to,
          actor: event.actor.id,
        },
        'transition committed',
      );
    });
    this.runtime = runtime;
    return runtime;
  }

  /**
   * The JobExecutor has no delay, so a retry with backoff waits here first.
   * A process that stops while it waits loses only the timer: the run is
   * still queued, and `recover()` hands it over on the next start.
   */
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
      throw new Error('The lifecycle example has not started.');
    await jobs.addJob(new EffectJob({ effectRunId: runId }));
  }
}
