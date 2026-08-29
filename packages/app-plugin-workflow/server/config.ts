import path from 'node:path';
import {
  defineAppConfig,
  envBoolean,
  envString,
  type AppConfigDefinition,
} from '@nocobase/app-server-kit/config';
import { Type } from '@sinclair/typebox';
import type { ResolvedAppRuntimeConfigContext } from '@nocobase/app-server-kit/runtime';

export interface WorkflowRuntimeConfig {
  readonly sourceRoot: string;
  readonly distRoot: string;
  readonly artifactDisk: string;
  readonly sourceResolverDiagnostic: boolean;
  readonly production: boolean;
}

export interface ResolveWorkflowRuntimeConfigOptions {
  readonly rootDir: string;
  readonly serverDir: string;
}

export const workflowConfig: AppConfigDefinition<
  WorkflowRuntimeConfig,
  ResolvedAppRuntimeConfigContext
> = defineAppConfig<WorkflowRuntimeConfig>()({
  namespace: 'workflow',
  schema: Type.Object({
    sourceRoot: Type.String(),
    distRoot: Type.String(),
    artifactDisk: Type.String(),
    sourceResolverDiagnostic: Type.Boolean(),
    production: Type.Boolean(),
  }),
  defaults: ({
    paths,
    runtimePaths,
  }: ResolvedAppRuntimeConfigContext): WorkflowRuntimeConfig =>
    resolveWorkflowRuntimeConfig(
      {
        sourceRoot: paths.server('workflows'),
        distRoot: paths.server('workflows'),
        artifactDisk: 'local',
        sourceResolverDiagnostic: false,
        production: false,
      },
      {
        rootDir: runtimePaths.rootDir ?? paths.root(),
        serverDir: runtimePaths.serverDir ?? paths.server(),
      },
    ),
  envMappings: {
    WORKFLOW_ARTIFACT_DISK: envString('artifactDisk'),
    WORKFLOW_SOURCE_RESOLVER_DIAGNOSTIC: envBoolean('sourceResolverDiagnostic'),
    NODE_ENV: {
      path: 'production',
      parse: (value): boolean => value === 'production',
    },
  },
});

export function resolveWorkflowRuntimeConfig(
  config: WorkflowRuntimeConfig,
  options: ResolveWorkflowRuntimeConfigOptions,
): WorkflowRuntimeConfig {
  const built = path.basename(path.dirname(options.serverDir)) === 'dist';
  return {
    ...config,
    distRoot: built
      ? path.join(options.serverDir, 'workflows')
      : path.join(options.rootDir, 'dist', 'server', 'workflows'),
    production: config.production || built,
  };
}
