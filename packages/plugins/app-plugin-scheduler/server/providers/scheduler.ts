import { pathToFileURL } from 'node:url';

import {
  appScheduleDefinitionContributionsToken,
  type AppPluginApplication,
  type AppScheduleDefinitionContribution,
} from '@nocobase/app-server/plugins';
import {
  queueConfig,
  queueJobFactoryRegistryToken,
  queueManagerToken,
} from '@nocobase/app-server/queue';
import { databaseManagerToken } from '@nocobase/db';
import type { NocoBaseQueueWorker } from '@nocobase/queue';
import { ServiceProvider } from '@nocobase/service-provider';

import { ScheduleDispatchJob } from '../jobs/dispatch.js';
import { ScheduleOccurrenceStore } from '../occurrences.js';
import { DefaultSchedulerService } from '../services/scheduler.js';
import type { NormalizedScheduleDefinition } from '../schedules/define.js';
import {
  JobDispatchRegistry,
  createJobTarget,
} from '../schedules/job-target.js';
import { ScheduleTargetRegistry } from '../schedules/registry.js';
import { ScheduleStore, type ScheduleManifestEntry } from '../store.js';
import {
  jobDispatchRegistryToken,
  scheduleOccurrenceStoreToken,
  scheduleStoreToken,
  scheduleTargetRegistryToken,
  schedulerServiceToken,
  schedulerStartupModeToken,
} from '../tokens.js';

export class SchedulerProvider extends ServiceProvider<AppPluginApplication> {
  public readonly name: string = '@nocobase/app-plugin-scheduler';
  private worker: NocoBaseQueueWorker | undefined;
  private workerCompletion: Promise<void> | undefined;

  public override register(): void {
    this.app.container.singleton(
      jobDispatchRegistryToken,
      () => new JobDispatchRegistry(),
    );
    this.app.container.singleton(scheduleTargetRegistryToken, () => {
      const registry = new ScheduleTargetRegistry();
      registry.register(
        createJobTarget(this.app.container.resolve(jobDispatchRegistryToken)),
      );
      return registry;
    });
    this.app.container.singleton(
      scheduleOccurrenceStoreToken,
      (container) =>
        new ScheduleOccurrenceStore(container.resolve(databaseManagerToken)),
    );
    this.app.container.singleton(
      scheduleStoreToken,
      (container) =>
        new ScheduleStore(
          container.resolve(databaseManagerToken),
          this.app.appName,
        ),
    );
    this.app.container.singleton(
      schedulerServiceToken,
      (container) =>
        new DefaultSchedulerService(
          container.resolve(scheduleStoreToken),
          container.resolve(scheduleTargetRegistryToken),
          () => this.loadManifest(),
        ),
    );
  }

  public override async boot(): Promise<void> {
    const config = this.app.config.get(queueConfig);
    if (config.connections.database?.driver !== 'database')
      throw new Error(
        'Scheduler requires a Database Queue connection named "database".',
      );
    this.app.container
      .resolve(queueJobFactoryRegistryToken)
      .register(
        ScheduleDispatchJob.options.name ?? ScheduleDispatchJob.name,
        () =>
          new ScheduleDispatchJob(
            this.app.container.resolve(scheduleTargetRegistryToken),
            this.app.container.resolve(scheduleOccurrenceStoreToken),
          ),
      );
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
    await this.app.container
      .resolve(schedulerServiceToken)
      .sync(startupMode?.finalize ?? false);
    if (startupMode?.kind === 'sync-only') return;
    this.worker = queue.createWorker({
      connection: 'database',
      queues: ['schedule'],
      concurrency: 1,
    });
    this.workerCompletion = this.worker.start();
  }

  public override async shutdown(): Promise<void> {
    await this.worker?.stop();
    await this.workerCompletion;
    this.workerCompletion = undefined;
    this.app.container
      .resolveIfCreated(queueJobFactoryRegistryToken)
      ?.unregister(
        ScheduleDispatchJob.options.name ?? ScheduleDispatchJob.name,
      );
  }

  private async loadManifest(): Promise<readonly ScheduleManifestEntry[]> {
    const contributions = this.app.container
      .resolve(appScheduleDefinitionContributionsToken)
      .list();
    const entries: ScheduleManifestEntry[] = [];
    for (const contribution of contributions)
      entries.push(...(await loadContribution(contribution)));
    return entries;
  }
}

async function loadContribution(
  contribution: AppScheduleDefinitionContribution,
): Promise<readonly ScheduleManifestEntry[]> {
  const module = (await import(pathToFileURL(contribution.location).href)) as {
    default?: unknown;
  };
  if (!Array.isArray(module.default))
    throw new Error(
      `Schedule definitions from ${contribution.packageName} must default export an array.`,
    );
  return module.default.map((definition: unknown): ScheduleManifestEntry => {
    if (!isNormalizedDefinition(definition))
      throw new Error(
        `Schedule definitions from ${contribution.packageName} must use defineSchedule().`,
      );
    return { owner: contribution.packageName, definition };
  });
}

function isNormalizedDefinition(
  value: unknown,
): value is NormalizedScheduleDefinition {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { definitionHash?: unknown }).definitionHash === 'string'
  );
}
