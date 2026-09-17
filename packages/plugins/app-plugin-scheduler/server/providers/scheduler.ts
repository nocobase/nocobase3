import { type AppPluginApplication } from '@nocobase/app-server/plugins';
import {
  queueJobFactoryRegistryToken,
  queueManagerToken,
} from '@nocobase/app-server/queue';
import { databaseManagerToken } from '@nocobase/db';
import type { NocoBaseQueueWorker } from '@nocobase/queue';
import {
  createServiceToken,
  ServiceProvider,
  type ServiceToken,
} from '@nocobase/service-provider';

import { ScheduleDispatchJob } from '../jobs/dispatch.js';
import { ScheduleOccurrenceStore } from '../occurrences.js';
import { ScheduleTargetRegistry } from '../schedules/registry.js';
import {
  DefaultSchedulerService,
  schedulerServiceToken,
} from '../services/scheduler.js';
import { ScheduleStore } from '../store.js';

export interface SchedulerStartupMode {
  readonly kind: 'sync-only';
  readonly finalize: boolean;
}

/**
 * Injected by `nb3 schedule:sync` before the application starts, so the CLI
 * synchronizes the manifest without leaving a worker behind. It carries a
 * startup switch rather than a service, and stays internal to this package.
 */
export const schedulerStartupModeToken: ServiceToken<SchedulerStartupMode> =
  createServiceToken<SchedulerStartupMode>(
    '@nocobase/app-plugin-scheduler/startup-mode',
  );

const DISPATCH_JOB_NAME: string =
  ScheduleDispatchJob.options.name ?? ScheduleDispatchJob.name;

interface SchedulerInternals {
  readonly targets: ScheduleTargetRegistry;
  readonly occurrences: ScheduleOccurrenceStore;
  readonly service: DefaultSchedulerService;
}

export class SchedulerProvider extends ServiceProvider<AppPluginApplication> {
  public readonly name: string = '@nocobase/app-plugin-scheduler';
  private worker: NocoBaseQueueWorker | undefined;
  private workerCompletion: Promise<void> | undefined;
  private reconcileTimer: ReturnType<typeof setInterval> | undefined;
  private internals: SchedulerInternals | undefined;

  public override register(): void {
    // One service reaches the container. The target registry, the job dispatch
    // table and both stores are this provider's own parts, handed to whatever
    // needs them instead of being resolvable by anyone holding the container.
    this.app.container.singleton(
      schedulerServiceToken,
      () => this.compose().service,
    );
  }

  public override async boot(): Promise<void> {
    this.app.container
      .resolve(queueJobFactoryRegistryToken)
      .register(DISPATCH_JOB_NAME, () => {
        const { targets, occurrences } = this.compose();
        return new ScheduleDispatchJob(targets, occurrences);
      });
    this.app.container
      .resolve(queueManagerToken)
      .registerJob(ScheduleDispatchJob);
  }

  public override async start(): Promise<void> {
    const queue = this.app.container.resolve(queueManagerToken);
    await queue.init();
    const startupMode = this.app.container.resolveIfCreated(
      schedulerStartupModeToken,
    );
    const scheduler = this.app.container.resolve(schedulerServiceToken);
    await scheduler.sync(startupMode?.finalize ?? false);
    if (startupMode?.kind === 'sync-only') return;
    this.worker = queue.createWorker({
      queues: ['schedule'],
      concurrency: 1,
    });
    this.workerCompletion = this.worker.start();
    this.reconcileTimer = setInterval(() => {
      void scheduler.reconcileOccurrences().catch((error: unknown) => {
        console.error('Scheduler occurrence reconciliation failed', error);
      });
    }, 60_000);
    this.reconcileTimer.unref?.();
  }

  public override async shutdown(): Promise<void> {
    if (this.reconcileTimer) clearInterval(this.reconcileTimer);
    this.reconcileTimer = undefined;
    await this.worker?.stop();
    await this.workerCompletion;
    this.workerCompletion = undefined;
    this.app.container
      .resolveIfCreated(queueJobFactoryRegistryToken)
      ?.unregister(DISPATCH_JOB_NAME);
  }

  private compose(): SchedulerInternals {
    if (this.internals) return this.internals;
    const container = this.app.container;
    const database = container.resolve(databaseManagerToken);
    const targets = new ScheduleTargetRegistry();
    const occurrences = new ScheduleOccurrenceStore(database);
    const store = new ScheduleStore(
      database,
      this.app.appName,
      container.resolve(queueManagerToken).schedules('schedule'),
    );
    this.internals = {
      targets,
      occurrences,
      service: new DefaultSchedulerService(store, occurrences, targets),
    };
    return this.internals;
  }
}
