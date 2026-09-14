import { queueManagerToken } from '@nocobase/app-server/queue';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { databaseManagerToken } from '@nocobase/db';
import type { AppDriveConfig, FsDriveDiskConfig } from '@nocobase/drive';
import { ServiceProvider } from '@nocobase/service-provider';
import { WorkflowScheduleTarget } from './schedule-target.js';
import { EXECUTION_STATUS } from './engine/constants.js';

import { type WorkflowRuntimeConfig } from './config.js';
import { WorkflowService } from './service.js';
import {
  internalWorkflowServiceToken,
  workflowServiceToken,
} from './tokens.js';

export interface WorkflowProviderConfig {
  readonly app: {
    readonly publicBasePath: string;
  };
  readonly drive: AppDriveConfig;
  readonly workflow: {
    readonly sourceRoot: string;
    readonly distRoot: string;
    readonly artifactDisk: string;
    readonly production: boolean;
  };
}

export type WorkflowProviderApplication =
  AppPluginApplication<WorkflowProviderConfig>;

export class WorkflowProvider<
  TApplication extends WorkflowProviderApplication =
    WorkflowProviderApplication,
> extends ServiceProvider<TApplication> {
  public readonly name: string = '@nocobase/app-plugin-workflow';
  private schedulerIntegration:
    typeof import('@nocobase/app-plugin-scheduler/server/tokens') | undefined;

  public override register(): void {
    if (!this.app.container.has(databaseManagerToken)) return;
    const workflow = this.app.config.get<WorkflowRuntimeConfig>('workflow')!;
    const drive = this.app.config.get<AppDriveConfig>('drive')!;

    this.app.container.singleton(
      internalWorkflowServiceToken,
      (container) =>
        new WorkflowService({
          database: container.resolve(databaseManagerToken),
          queue: container.resolve(queueManagerToken),
          queueName: `workflow:${this.app.appName}`,
          services: this.app.container,
          sourceRoot: workflow.sourceRoot,
          distRoot: workflow.distRoot,
          artifactDisk: resolveWorkflowArtifactDisk(workflow, drive),
          production: workflow.production,
          terminalObserver: async (event) => {
            const reporterToken =
              this.schedulerIntegration?.scheduleExecutionReporterToken;
            if (
              event.sourceType !== 'schedule' ||
              !event.sourceId ||
              !reporterToken ||
              !this.app.container.has(reporterToken)
            )
              return;
            const reference = {
              type: 'workflow-run',
              id: String(event.runId),
            };
            const status =
              event.status === EXECUTION_STATUS.RESOLVED
                ? 'succeeded'
                : event.status === EXECUTION_STATUS.ABORTED &&
                    event.reason === 'timeout'
                  ? 'timed_out'
                  : event.status === EXECUTION_STATUS.ABORTED
                    ? 'cancelled'
                    : 'failed';
            await this.app.container
              .resolve(reporterToken)
              .complete(event.sourceId, reference, {
                status,
                ...(status === 'failed' ? { reason: 'execution-failed' } : {}),
                ...(status === 'cancelled'
                  ? { reason: 'execution-cancelled' }
                  : {}),
                ...(status === 'timed_out'
                  ? { reason: 'execution-timeout' }
                  : {}),
                finishedAt: new Date(event.finishedAt),
              })
              .catch((error: unknown) => {
                console.error(
                  'Workflow schedule completion notification failed',
                  {
                    occurrenceId: event.sourceId,
                    reference,
                    targetType: 'workflow',
                    error,
                  },
                );
              });
          },
        }),
    );
    this.app.container.singleton(workflowServiceToken, (container) =>
      container.resolve(internalWorkflowServiceToken),
    );
  }

  public override async boot(): Promise<void> {
    try {
      this.schedulerIntegration =
        await import('@nocobase/app-plugin-scheduler/server/tokens');
    } catch (error) {
      if (isMissingSchedulerPackage(error)) return;
      throw error;
    }
    const { scheduleTargetRegistryToken } = this.schedulerIntegration;
    // The scheduler registry is created during register; only resolve it when
    // the scheduler plugin is actually present.
    if (!this.app.container.has(scheduleTargetRegistryToken)) return;
    this.app.container
      .resolve(scheduleTargetRegistryToken)
      .register(
        new WorkflowScheduleTarget(
          this.app.container.resolve(databaseManagerToken),
          this.app.container.resolve(workflowServiceToken),
        ),
      );
  }

  public override async shutdown(): Promise<void> {
    await this.app.container
      .resolveIfCreated(internalWorkflowServiceToken)
      ?.dispose();
  }
}

function isMissingSchedulerPackage(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ERR_MODULE_NOT_FOUND' &&
    error instanceof Error &&
    error.message.includes('@nocobase/app-plugin-scheduler')
  );
}

function resolveWorkflowArtifactDisk(
  workflow: WorkflowProviderConfig['workflow'],
  drive: AppDriveConfig,
): FsDriveDiskConfig {
  const name = workflow.artifactDisk ?? drive.default;
  const disk = drive.disks[name];
  if (!disk) {
    throw new Error(`Workflow Artifact disk "${name}" is not configured`);
  }
  if (disk.driver !== 'fs') {
    throw new Error(
      `Workflow Artifact disk "${name}" must use the fs/local driver`,
    );
  }
  if (disk.visibility !== 'private') {
    throw new Error(
      `Workflow Artifact disk "${name}" must have private visibility`,
    );
  }
  return disk;
}
