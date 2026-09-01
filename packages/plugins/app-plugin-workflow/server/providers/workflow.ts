import { databaseManagerToken } from '@nocobase/db';
import type { AppDriveConfig, FsDriveDiskConfig } from '@nocobase/drive';
import { loggingToken } from '@nocobase/app-server/logging';
import { queueManagerToken } from '@nocobase/app-server/queue';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { ServiceProvider } from '@nocobase/service-provider';
import { driveConfig } from '@nocobase/app-server/drive';

import { WorkflowService } from '../runtime/runtime.js';
import { workflowServiceToken } from '../tokens.js';
import { workflowConfig } from '../config.js';

export interface WorkflowProviderConfig {
  readonly app: {
    readonly publicBasePath: string;
  };
  readonly drive: AppDriveConfig;
  readonly workflow: {
    readonly sourceRoot: string;
    readonly distRoot: string;
    readonly artifactDisk: string;
    readonly sourceResolverDiagnostic: boolean;
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
      workflowServiceToken,
      (container) =>
        new WorkflowService({
          database: container.resolve(databaseManagerToken),
          queue: container.resolve(queueManagerToken),
          queueName: `workflow:${this.app.appName}`,
          app: this.app,
          sourceRoot: workflow.sourceRoot,
          distRoot: workflow.distRoot,
          artifactDisk: resolveWorkflowArtifactDisk(workflow, drive),
          production: workflow.production,
          sourceResolverDiagnostic: workflow.sourceResolverDiagnostic,
          warn: (message: string): void =>
            container.resolve(loggingToken).getLogger().warn(message),
        }),
    );
  }

  public override async shutdown(): Promise<void> {
    await this.app.container.resolveIfCreated(workflowServiceToken)?.dispose();
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
