import { driveConfig } from '@nocobase/app-server/drive';
import { queueManagerToken } from '@nocobase/app-server/queue';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { databaseManagerToken } from '@nocobase/db';
import type { AppDriveConfig, FsDriveDiskConfig } from '@nocobase/drive';
import { ServiceProvider } from '@nocobase/service-provider';
import { scheduleTargetRegistryToken } from '@nocobase/app-plugin-scheduler/server/tokens';
import { WorkflowScheduleTarget } from './schedule-target.js';

import { workflowConfig } from './config.js';
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

  public override register(): void {
    if (!this.app.container.has(databaseManagerToken)) return;
    const workflow = this.app.config.get(workflowConfig);
    const drive = this.app.config.get(driveConfig);

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
        }),
    );
    this.app.container.singleton(workflowServiceToken, (container) =>
      container.resolve(internalWorkflowServiceToken),
    );
  }

  public override async boot(): Promise<void> {
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
