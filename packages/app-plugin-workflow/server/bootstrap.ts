import type { AppPluginServerContext } from '@nocobase/app-server-kit/plugins';
import type {
  AppRuntime,
  AppRuntimeConfig,
} from '@nocobase/app-server-kit/runtime';
import type { AppDriveConfig, FsDriveDiskConfig } from '@nocobase/drive';
import type { NocoBaseQueueManager } from '@nocobase/queue';

import { bindWorkflowService, WorkflowService } from './runtime/runtime.js';

export interface WorkflowPluginConfig extends AppRuntimeConfig {
  drive: AppDriveConfig;
  workflow: {
    sourceRoot: string;
    distRoot: string;
    artifactDisk: string;
    sourceResolverDiagnostic: boolean;
    production: boolean;
  };
}

export interface WorkflowPluginDeps {
  runtime: AppRuntime<WorkflowPluginConfig>;
  queueManager: NocoBaseQueueManager;
  logging: { getLogger(): { warn(message: string): void } };
}

export interface WorkflowPluginServices {
  plugins: Record<string, unknown>;
}

export type WorkflowPluginServerContext = AppPluginServerContext<
  WorkflowPluginDeps,
  WorkflowPluginServices
>;

export default function bootstrapWorkflowPlugin({
  deps,
  lifecycle,
}: WorkflowPluginServerContext): void {
  const { runtime } = deps;
  if (!runtime.database) return;

  const workflowService = new WorkflowService({
    database: runtime.database,
    queue: deps.queueManager,
    app: runtime,
    sourceRoot: runtime.config.workflow.sourceRoot,
    distRoot: runtime.config.workflow.distRoot,
    artifactDisk: resolveWorkflowArtifactDisk(runtime.config),
    production: runtime.config.workflow.production,
    sourceResolverDiagnostic: runtime.config.workflow.sourceResolverDiagnostic,
    warn: (message: string): void => deps.logging.getLogger().warn(message),
  });
  bindWorkflowService(runtime, workflowService);
  lifecycle.registerDisposer('runtime', async () => {
    await workflowService.dispose();
  });
}

function resolveWorkflowArtifactDisk(
  config: WorkflowPluginConfig,
): FsDriveDiskConfig {
  const name = config.workflow.artifactDisk ?? config.drive.default;
  const disk = config.drive.disks[name];
  if (!disk)
    throw new Error(`Workflow Artifact disk "${name}" is not configured`);
  if (disk.driver !== 'fs')
    throw new Error(
      `Workflow Artifact disk "${name}" must use the fs/local driver`,
    );
  if (disk.visibility !== 'private')
    throw new Error(
      `Workflow Artifact disk "${name}" must have private visibility`,
    );
  return disk;
}
