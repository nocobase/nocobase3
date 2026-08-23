import { defineConfig, type ConfigFactory } from '@nocobase/app-server/config';

import type { AppWorkflowConfig } from './types.js';

const workflowConfig: ConfigFactory<AppWorkflowConfig> = defineConfig(({ env, paths }): AppWorkflowConfig => ({
  sourceRoot: paths.server('workflows'),
  distRoot: paths.server('workflows'),
  artifactDisk: env.string('WORKFLOW_ARTIFACT_DISK', 'local'),
  sourceResolverDiagnostic: env.boolean('WORKFLOW_SOURCE_RESOLVER_DIAGNOSTIC', false),
  production: env.string('NODE_ENV', 'development') === 'production',
}));

export default workflowConfig;
