import type { AppPluginServerContext } from '@nocobase/app-server/plugins';
import type {
  AppRuntime,
  AppRuntimeConfig,
} from '@nocobase/app-server/runtime';
import type { AppDriveConfig, FsDriveDiskConfig } from '@nocobase/drive';
import type { NocoBaseQueueManager } from '@nocobase/queue';

import {
  DatabaseWorkflowService,
  UnavailableWorkflowService,
} from './services/workflow.js';
import {
  bindRuntimeWorkflow,
  createAppWorkflowRuntime,
} from './workflows/runtime.js';

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
  services,
  lifecycle,
}: WorkflowPluginServerContext): void {
  const { runtime } = deps;
  if (!runtime.database) {
    services.plugins.workflow = new UnavailableWorkflowService();
    return;
  }

  const workflowRuntime = createAppWorkflowRuntime({
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
  bindRuntimeWorkflow(runtime, workflowRuntime);
  services.plugins.workflow = new DatabaseWorkflowService(
    runtime.database,
    workflowRuntime,
  );
  lifecycle.registerStarter('runtime', () => workflowRuntime.start());
  lifecycle.registerDisposer('runtime', () => workflowRuntime.stop());
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
