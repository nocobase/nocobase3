import { defineConfig } from '@nocobase/app-server-kit/config';
import { resolveWorkflowRuntimeConfig } from '@nocobase/app-plugin-workflow/server/config';
import type { AppRuntimeConfigFactory } from '@nocobase/app-server-kit/runtime';

import type {
  AppWorkflowConfig,
  AppConfig,
  DefaultAppConfigContext,
  DefaultAppScopeConfig,
} from './types.js';

const workflowConfig: AppRuntimeConfigFactory<
  AppWorkflowConfig,
  AppConfig,
  DefaultAppScopeConfig
> = defineConfig<AppWorkflowConfig, DefaultAppConfigContext>(
  ({ env, paths, runtimePaths }): AppWorkflowConfig =>
    resolveWorkflowRuntimeConfig(
      {
        sourceRoot: paths.server('workflows'),
        distRoot: paths.server('workflows'),
        artifactDisk: env.string('WORKFLOW_ARTIFACT_DISK', 'local'),
        sourceResolverDiagnostic: env.boolean(
          'WORKFLOW_SOURCE_RESOLVER_DIAGNOSTIC',
          false,
        ),
        production: env.string('NODE_ENV', 'development') === 'production',
      },
      {
        rootDir: runtimePaths?.rootDir ?? paths.root(),
        serverDir: runtimePaths?.serverDir ?? paths.server(),
      },
    ),
);

export default workflowConfig;
