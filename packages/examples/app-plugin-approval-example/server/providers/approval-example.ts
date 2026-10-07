import { jobExecutorServiceToken } from '@nocobase/app-server/jobs';
import { loggingToken } from '@nocobase/app-server/logging';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { databaseManagerToken } from '@nocobase/db';
import {
  createRepositoryLifecycleStore,
  LifecycleRuntime,
} from '@nocobase/lifecycle';
import {
  createLifecycleJobs,
  type LifecycleJobs,
} from '@nocobase/lifecycle/jobs';
import { ServiceProvider } from '@nocobase/service-provider';

import { ApprovalExampleService } from '../lab/service.js';
import {
  APPROVAL_EXAMPLE_COLLECTIONS,
  APPROVAL_EXAMPLE_SCOPE,
} from '../scope.js';
import { approvalExampleServiceToken } from '../tokens.js';

/** How often the triggers and the lab's clock are swept. */
export const SWEEP_MS: number = 10_000;

/** How long finished effect runs are kept. */
export const RUN_RETENTION_MS: number = 7 * 86_400_000;

/**
 * Wires the example to the application: one runtime on the Repository store
 * of the default connection holding every scenario's lifecycle and its
 * approvals' runs, effects as jobs, and a sweep that runs the triggers and
 * the lab's clock — reminders, escalations, scheduled payments, expiries.
 */
export class ApprovalExampleProvider extends ServiceProvider<AppPluginApplication> {
  public readonly name: string = APPROVAL_EXAMPLE_SCOPE;
  private jobs: LifecycleJobs | undefined;
  private runtime: LifecycleRuntime | undefined;

  public override register(): void {
    this.app.container.singleton(
      approvalExampleServiceToken,
      () =>
        new ApprovalExampleService(
          this.app.container.resolve(databaseManagerToken),
          this.lifecycleRuntime(),
        ),
    );
  }

  public override async start(): Promise<void> {
    const runtime = this.lifecycleRuntime();
    await this.app.container.resolve(approvalExampleServiceToken).start();
    await this.effectJobs().start(runtime);
  }

  public override async shutdown(): Promise<void> {
    await this.jobs?.shutdown();
    this.jobs = undefined;
  }

  /** One runtime for the service and the executors, created on first use. */
  private lifecycleRuntime(): LifecycleRuntime {
    if (this.runtime) return this.runtime;
    const logger = this.app.container
      .resolve(loggingToken)
      .getLogger('approval-example');
    this.runtime = new LifecycleRuntime({
      store: createRepositoryLifecycleStore(
        this.app.container.resolve(databaseManagerToken),
        {
          collections: {
            transitions: APPROVAL_EXAMPLE_COLLECTIONS.transitions,
            effectRuns: APPROVAL_EXAMPLE_COLLECTIONS.effectRuns,
          },
        },
      ),
      dispatcher: this.effectJobs(),
      logger: {
        warn: (message, details) => logger.warn({ details }, message),
        error: (message, details) => logger.error({ details }, message),
      },
    });
    return this.runtime;
  }

  /** The dispatcher, created before the runtime that uses it. */
  private effectJobs(): LifecycleJobs {
    if (this.jobs) return this.jobs;
    const executors = this.app.container.resolve(jobExecutorServiceToken);
    const logger = this.app.container
      .resolve(loggingToken)
      .getLogger('approval-example');
    this.jobs = createLifecycleJobs({
      jobs: executors.getJobExecutor(APPROVAL_EXAMPLE_SCOPE),
      schedule: executors.getScheduleExecutor(APPROVAL_EXAMPLE_SCOPE),
      // Stored with every queued task: keep it stable.
      jobName: `${APPROVAL_EXAMPLE_SCOPE}/effect`,
      sweepName: 'clock',
      sweepEveryMs: SWEEP_MS,
      onSweep: async () => {
        await this.app.container
          .resolve(approvalExampleServiceToken)
          .sweep(false);
        await this.lifecycleRuntime().prune({
          olderThan: new Date(Date.now() - RUN_RETENTION_MS),
        });
      },
      logger: {
        warn: (message, details) => logger.warn({ details }, message),
        error: (message, details) => logger.error({ details }, message),
      },
    });
    return this.jobs;
  }
}
