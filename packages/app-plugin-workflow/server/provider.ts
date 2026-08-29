import { databaseManagerToken } from '@nocobase/app-database';
import type { AppDriveConfig, FsDriveDiskConfig } from '@nocobase/drive';
import { driveConfig } from '@nocobase/app-server-kit/drive';
import { loggingToken } from '@nocobase/app-server-kit/logging';
import { queueManagerToken } from '@nocobase/app-server-kit/queue';
import type { AppPluginApplication } from '@nocobase/app-server-kit/plugins';
import { ServiceProvider } from '@nocobase/service-provider';

import { WorkflowService } from './runtime/runtime.js';
import { workflowServiceToken } from './token.js';
import { workflowConfig } from './config.js';

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

export type WorkflowProviderApplication = AppPluginApplication;

export default class WorkflowProvider<
  TApplication extends WorkflowProviderApplication =
    WorkflowProviderApplication,
> extends ServiceProvider<TApplication> {
  public readonly name: string = '@nocobase/app-plugin-workflow';

  public override register(): void {
    if (!this.app.container.has(databaseManagerToken)) return;

    this.app.container.singleton(
      workflowServiceToken,
      (container) =>
        new WorkflowService({
          database: container.resolve(databaseManagerToken),
          queue: container.resolve(queueManagerToken),
          queueName: `workflow:${this.app.appName}`,
          app: this.app,
          sourceRoot: this.app.config.get(workflowConfig).sourceRoot,
          distRoot: this.app.config.get(workflowConfig).distRoot,
          artifactDisk: resolveWorkflowArtifactDisk(
            this.app.config.get(workflowConfig),
            this.app.config.get(driveConfig),
          ),
          production: this.app.config.get(workflowConfig).production,
          sourceResolverDiagnostic:
            this.app.config.get(workflowConfig).sourceResolverDiagnostic,
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
